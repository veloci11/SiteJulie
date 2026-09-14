"""Separate smooth irradiance from repeatable plaster detail; keep previous assets.
Blender --background --python scripts/blender/build_clean_rooms.py -- hall|extension
"""
import bpy, bmesh, math, json, sys, time, struct, zlib, ctypes as C, shutil
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
STEM=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'hall'
PRIVATE=ROOT/'assets/museum/clean-experiments'/STEM;PRIVATE.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'public/museum/clean';OUT.mkdir(exist_ok=True)
START=time.time()
backup=ROOT/'assets/museum/clean-before-joint-refine';backup.mkdir(exist_ok=True)
for previous in [ROOT/'public/museum'/(STEM+'-clean.glb'),PRIVATE/(STEM+'-clean.blend'),ROOT/'public/museum/end-cap.glb']:
 if previous.exists() and not (backup/previous.name).exists():shutil.copy2(previous,backup/previous.name)
def xyz(p):return (p[0],-p[2],p[1])
def key(p):return tuple(round(v,4) for v in p)
def facekey(points):return tuple(sorted(points))
def log(*s):print('CLEAN_ROOM',*s,flush=True)
def select(objects):
 bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:obj.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
def join(objects,name):
 select(objects)
 if len(objects)>1:bpy.ops.object.join()
 obj=bpy.context.object;obj.name=name;return obj
def unwrap(obj,name):
 select([obj]);uv=obj.data.uv_layers.new(name=name);obj.data.uv_layers.active=uv;uv.active_render=True
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
 bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.004,area_weight=1,correct_aspect=True,scale_to_bounds=True)
 bpy.ops.object.mode_set(mode='OBJECT');return uv
def png(path,linear):
 h,w,_=linear.shape;srgb=np.where(linear<=.0031308,linear*12.92,1.055*np.maximum(linear,0)**(1/2.4)-.055)
 rgb=np.uint8(np.clip(np.rint(srgb[::-1]*255),0,255))
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 raw=b''.join(b'\0'+row.tobytes() for row in rgb)
 path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b''))
def denoise(colors):
 lib=C.CDLL('/Applications/Blender.app/Contents/Resources/lib/libOpenImageDenoise.dylib')
 def api(name,result,args):
  f=getattr(lib,name);f.restype=result;f.argtypes=args;return f
 new=api('oidnNewDevice',C.c_void_p,[C.c_int]);commit=api('oidnCommitDevice',None,[C.c_void_p]);newfilter=api('oidnNewFilter',C.c_void_p,[C.c_void_p,C.c_char_p])
 image=api('oidnSetSharedFilterImage',None,[C.c_void_p,C.c_char_p,C.c_void_p,C.c_int,C.c_size_t,C.c_size_t,C.c_size_t,C.c_size_t,C.c_size_t])
 boolean=api('oidnSetFilterBool',None,[C.c_void_p,C.c_char_p,C.c_bool]);commitfilter=api('oidnCommitFilter',None,[C.c_void_p]);execute=api('oidnExecuteFilter',None,[C.c_void_p])
 error=api('oidnGetDeviceError',C.c_int,[C.c_void_p,C.POINTER(C.c_char_p)]);release=api('oidnReleaseFilter',None,[C.c_void_p]);releasedevice=api('oidnReleaseDevice',None,[C.c_void_p])
 colors=np.ascontiguousarray(colors);result=np.empty_like(colors);h,w,_=colors.shape
 device=new(1);commit(device);f=newfilter(device,b'RT')
 image(f,b'color',colors.ctypes.data,3,w,h,0,0,0);image(f,b'output',result.ctypes.data,3,w,h,0,0,0)
 boolean(f,b'hdr',True);commitfilter(f);execute(f);message=C.c_char_p()
 if error(device,C.byref(message)):raise RuntimeError(message.value)
 release(f);releasedevice(device);return result
def material(name,path,uvname,scale=1,color=None):
 mat=bpy.data.materials.new(name);mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links
 tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(path),check_existing=False);tex.image.colorspace_settings.name='sRGB';tex.image.pack()
 uv=n.new('ShaderNodeUVMap');uv.uv_map=uvname;l.new(uv.outputs[0],tex.inputs['Vector']);l.new(tex.outputs[0],n.get('Principled BSDF').inputs['Base Color'])
 if name.startswith('LIGHTMAP '):mat['lightmapRadianceScale']=scale;mat['plasterColorLinear']=list(color);mat['lightmapTexCoord']=1;mat['lightmapIncludes']='diffuse direct+indirect only; no albedo; no normal detail'
 else:mat['bakeRadianceScale']=scale
 return mat
def replace(obj,mat):
 obj.data.materials.clear();obj.data.materials.append(mat)
 for p in obj.data.polygons:p.material_index=0

# Recover exact previous atlas coordinates from private unquantized baked sources.
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum/bake-experiments'/STEM/(STEM+'-baked.blend')))
old_uv={};old_triangles=0
for obj in bpy.context.scene.objects:
 if obj.type!='MESH' or not obj.name.startswith('BAKED '):continue
 uv=obj.data.uv_layers.active
 for poly in obj.data.polygons:
  coords=[key(obj.matrix_world@obj.data.vertices[obj.data.loops[i].vertex_index].co) for i in poly.loop_indices]
  old_uv[facekey(coords)]={co:tuple(uv.data[i].uv) for co,i in zip(coords,poly.loop_indices)}
old_report=json.loads((ROOT/'public/museum/bakes'/(STEM+'-report.json')).read_text())
old_scale={a['group']:a['radianceScale'] for a in old_report['atlases']}
light_data=[]
for obj in bpy.context.scene.objects:
 if obj.type=='LIGHT':light_data.append({'type':obj.data.type,'energy':obj.data.energy,'color':tuple(obj.data.color),'matrix':obj.matrix_world.copy(),'angle':getattr(obj.data,'angle',0),'size':getattr(obj.data,'size',1)})
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum'/(STEM+'.blend')))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True;scene.cycles.max_bounces=8;scene.cycles.diffuse_bounces=6
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
scene.cycles.device='GPU';scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.64,.76,1,1);scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.45
for item in light_data:
 bpy.ops.object.light_add(type=item['type']);obj=bpy.context.object;obj.matrix_world=item['matrix'];obj.data.energy=item['energy'];obj.data.color=item['color']
 if item['type']=='SUN':obj.data.angle=item['angle']
 if item['type']=='AREA':obj.data.shape='DISK';obj.data.size=item['size']

color=(.68,.57,.44) if STEM=='hall' else (.67,.54,.42)
groups={'walls':[],'floor':[],'furniture':[]};misses=0
for obj in list(scene.objects):
 if obj.type!='MESH':continue
 name=obj.data.materials[0].name.lower()
 for a in list(obj.data.color_attributes):obj.data.color_attributes.remove(a)
 if 'leaves' in name or 'glass' in name or 'lamp diffuser' in name:
  if 'glass' in name:obj.visible_shadow=False
  continue
 group='walls' if 'plaster' in name else ('floor' if any(s in name for s in ['travertine base','mortar','sand travertine','clay floor']) else 'furniture')
 groups[group].append(obj)
 if group=='walls':
  uv=obj.data.uv_layers.active or obj.data.uv_layers.new();uv.name='MetricUV'
  # Meters rather than the old four-meter source texture repeat.
  for p in obj.data.polygons:
   normal=obj.matrix_world.to_3x3()@p.normal;axis=max(range(3),key=lambda i:abs(normal[i]));axes=(1,2) if axis==0 else ((0,2) if axis==1 else (0,1))
   for i in p.loop_indices:
    point=obj.matrix_world@obj.data.vertices[obj.data.loops[i].vertex_index].co;uv.data[i].uv=(point[axes[0]],point[axes[1]])
  for mat in obj.data.materials:
   n=mat.node_tree.nodes;l=mat.node_tree.links;b=n.get('Principled BSDF')
   for socket in ['Base Color','Normal']:
    for link in list(b.inputs[socket].links):l.remove(link)
   b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=.95
 else:
  uv=obj.data.uv_layers.active or obj.data.uv_layers.new();uv.name='OriginalLightUV'
  for p in obj.data.polygons:
   coords=[key(obj.matrix_world@obj.data.vertices[obj.data.loops[i].vertex_index].co) for i in p.loop_indices];mapping=old_uv.get(facekey(coords))
   if mapping is None:misses+=1;continue
   for co,i in zip(coords,p.loop_indices):uv.data[i].uv=mapping[co]
assert misses==0,f'Cannot preserve {misses} original atlas faces'
log('UV_REUSE_VALIDATED',STEM)

# Confirmed construction defects: coincident internal spandrel faces, near-flush
# vault ribs, and 16.5mm-deep mortar grooves only 4mm wide. Keep visible profiles.
removed_internal_faces=0;shifted_ribs=0
for obj in groups['walls']:
 duplicates={}
 for p in obj.data.polygons:
  k=facekey([key(obj.matrix_world@obj.data.vertices[i].co) for i in p.vertices]);duplicates.setdefault(k,[]).append(p.index)
 remove=[]
 for ids in duplicates.values():
  if len(ids)==2 and obj.data.polygons[ids[0]].normal.dot(obj.data.polygons[ids[1]].normal)<-.99:remove+=ids
 if remove:
  bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[i] for i in remove],context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();removed_internal_faces+=len(remove)
 if STEM=='hall':
  parent=list(range(len(obj.data.vertices)))
  def root(i):
   while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
   return i
  for e in obj.data.edges:
   a,b=map(root,e.vertices);parent[a]=b
  components={}
  for v in obj.data.vertices:components.setdefault(root(v.index),[]).append(v.index)
  for indices in components.values():
   points=[obj.matrix_world@obj.data.vertices[i].co for i in indices]
   lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
   if hi[0]-lo[0]>12 and abs((hi[1]-lo[1])-.26)<.001 and abs(lo[2]-5.3)<.001 and abs(hi[2]-6.74)<.001:
    delta=obj.matrix_world.inverted().to_3x3()@Vector((0,0,-.055))
    for i in indices:obj.data.vertices[i].co+=delta
    shifted_ribs+=1
for obj in groups['floor']:
 name=obj.data.materials[0].name
 if name=='Fine warm mortar':
  inverse=obj.matrix_world.inverted()
  for v in obj.data.vertices:
   p=obj.matrix_world@v.co
   if abs(p.z+.01)<.0001:p.z=.004;v.co=inverse@p
 # Recalculate floor radiance with a shallow joint; metric UVs stay independent.
 uv=obj.data.uv_layers.active;uv.name='MetricUV'
 for poly in obj.data.polygons:
  normal=obj.matrix_world.to_3x3()@poly.normal;axis=max(range(3),key=lambda i:abs(normal[i]));axes=(1,2) if axis==0 else ((0,2) if axis==1 else (0,1))
  for i in poly.loop_indices:
   p=obj.matrix_world@obj.data.vertices[obj.data.loops[i].vertex_index].co;uv.data[i].uv=(p[axes[0]]*.25,p[axes[1]]*.25)
 for mat in obj.data.materials:
  n=mat.node_tree.nodes;l=mat.node_tree.links;b=n.get('Principled BSDF');uvnode=n.new('ShaderNodeUVMap');uvnode.uv_map='MetricUV'
  for tex in list(n):
   if tex.type=='TEX_IMAGE':l.new(uvnode.outputs[0],tex.inputs['Vector'])
  for normal in n:
   if normal.type=='NORMAL_MAP':normal.inputs['Strength'].default_value=.10;normal.uv_map='MetricUV'
  if 'travertine' in mat.name.lower():
   mapping=n.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=4/1.2;l.new(uvnode.outputs[0],mapping.inputs[0])
   tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/'assets/materials/pbr/travertine/base_color.png'),check_existing=True);tex.image.colorspace_settings.name='sRGB';l.new(mapping.outputs[0],tex.inputs['Vector'])
   tint=n.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(.76,.65,.49,1);l.new(tex.outputs['Color'],tint.inputs[1]);l.new(tint.outputs[0],b.inputs['Base Color'])
log('GEOMETRY_REFINED','internalFacesRemoved',removed_internal_faces,'vaultRibsLowered',shifted_ribs,'mortarTop',.004)

# Terminal closure remains a separate export. It shadows only the final salon bake.
cap=None
if STEM=='extension':
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz((0,3.4,9.195)));cap=bpy.context.object;cap.name='Terminal plaster closure';cap.dimensions=(3.48,.37,6.8)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mat=bpy.data.materials.new('Terminal plaster');mat.diffuse_color=(*color,1);mat.use_nodes=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1);cap.data.materials.append(mat)
 uv=cap.data.uv_layers.active;uv.name='MetricUV'
 for p in cap.data.polygons:
  for i in p.loop_indices:
   point=cap.matrix_world@cap.data.vertices[cap.data.loops[i].vertex_index].co;uv.data[i].uv=(point.x,point.z)

walls=join(groups['walls'],'LIGHTMAP '+STEM+' plaster');unwrap(walls,'LightUV')
report={'module':STEM,'refinement':{'internalFacesRemoved':removed_internal_faces,'vaultRibsLowered':shifted_ribs,'ribShiftMeters':.055,'mortarTopY':.004,'jointDepthMeters':.0025},'originalAtlasFacesMatched':True,'atlases':[],'wallColorLinear':color,'capSeparate':bool(cap)}
deliveries=[]
for obj,group,size in [(walls,'walls',2048)]+([(cap,'cap',512)] if cap else []):
 if group=='cap':unwrap(obj,'LightUV')
 select([obj]);image=bpy.data.images.new(STEM+' '+group+' smooth irradiance',width=size,height=size,float_buffer=True,alpha=False);image.colorspace_settings.name='Linear Rec.709'
 for mat in obj.data.materials:
  node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.nodes.active=node
 scene.render.bake.use_pass_color=False;scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True;scene.render.bake.margin=24;scene.render.bake.margin_type='EXTEND'
 log('IRRADIANCE_BEGIN',group);bpy.ops.object.bake(type='DIFFUSE',use_selected_to_active=False)
 image.filepath_raw=str(PRIVATE/(group+'-irradiance.exr'));image.file_format='OPEN_EXR';image.save()
 pixels=np.empty(size*size*4,dtype=np.float32);image.pixels.foreach_get(pixels);rgb=denoise(pixels.reshape(size,size,4)[:,:,:3])
 scale=max(1,math.ceil(float(np.percentile(rgb,99.98))*4)/4);path=OUT/(STEM+'-'+group+'-light.png');png(path,np.clip(rgb/scale,0,1))
 mat=material('LIGHTMAP '+STEM+' '+group,path,'LightUV',scale,color);deliveries.append((obj,mat))
 report['atlases'].append({'group':group,'size':size,'radianceScale':scale,'path':'/museum/clean/'+path.name,'containsAlbedo':False,'containsNormalDetail':False})

# Floor is rebaked after the shallow-joint correction, with the same materials.
floor=join(groups['floor'],'BAKED '+STEM+' floor')
unwrap(floor,'FloorUV');image=bpy.data.images.new(STEM+' preserved floor',width=2048,height=2048,float_buffer=True,alpha=False);image.colorspace_settings.name='Linear Rec.709'
for mat in floor.data.materials:
 node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.nodes.active=node
scene.render.bake.use_pass_color=True;log('FLOOR_SHALLOW_JOINT_BAKE');bpy.ops.object.bake(type='DIFFUSE',use_selected_to_active=False)
pixels=np.empty(2048*2048*4,dtype=np.float32);image.pixels.foreach_get(pixels);rgb=denoise(pixels.reshape(2048,2048,4)[:,:,:3]);floor_scale=max(1,math.ceil(float(np.percentile(rgb,99.98))*4)/4);path=OUT/(STEM+'-floor.png');png(path,np.clip(rgb/floor_scale,0,1))
replace(floor,material('BAKED '+STEM+' floor',path,'FloorUV',floor_scale));report['floorRadianceScale']=floor_scale
for uv in list(floor.data.uv_layers):
 if uv.name!='FloorUV':floor.data.uv_layers.remove(uv)
furniture=join(groups['furniture'],'BAKED '+STEM+' furniture')
replace(furniture,material('BAKED '+STEM+' furniture',ROOT/'public/museum/bakes'/(STEM+'-furniture.png'),'OriginalLightUV',old_scale['furniture']))
for obj,mat in deliveries:replace(obj,mat)
for obj in scene.objects:
 if obj.type=='MESH' and obj.name.startswith('LIGHTMAP '):
  obj.data.uv_layers.active_index=0
  # glTF must preserve metric TEXCOORD_0 even though only TEXCOORD_1 is sampled.
  obj.data.uv_layers[0].active_render=True

def export(path,objects=None):
 if objects:select(objects)
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=bool(objects),export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=88,export_vertex_color='NONE',export_texcoords=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
if cap:
 cap.name='LIGHTMAP terminal cap';export(ROOT/'public/museum/end-cap.glb',[cap]);cap.hide_render=True;cap.hide_set(True)
objects=[o for o in scene.objects if o!=cap and o.type in {'MESH','EMPTY'}]
export(ROOT/'public/museum'/(STEM+'-clean.glb'),objects)
bpy.ops.wm.save_as_mainfile(filepath=str(PRIVATE/(STEM+'-clean.blend')))
report['bytes']=(ROOT/'public/museum'/(STEM+'-clean.glb')).stat().st_size;report['seconds']=time.time()-START
(OUT/(STEM+'-report.json')).write_text(json.dumps(report,indent=2));log('FINISHED',json.dumps(report))
