"""Closed, warmly lit rooms with independent metric material maps and irradiance UVs.
Blender --background --python scripts/blender/build_interior_rooms.py -- hall [--preview-only]
Preserves originals, anchors, collision coordinates and the accepted bevel UV correction.
"""
import bpy,bmesh,math,json,sys,time,struct,zlib,ctypes as C
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
STEM=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'hall'
PREVIEW_ONLY='--preview-only' in sys.argv
PRIVATE=ROOT/'assets/museum/interior-experiments'/STEM;PRIVATE.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'public/museum/interior';OUT.mkdir(exist_ok=True)
START=time.time()
sys.path.insert(0,str(ROOT/'scripts/blender'))
from interior_precision import clear_interfaces,smooth_irradiance,protect_thin_wall_uv,repair_mortar_irradiance
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


bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum'/(STEM+'.blend')))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=128;scene.cycles.use_denoising=True;scene.cycles.max_bounces=10;scene.cycles.diffuse_bounces=8
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
scene.cycles.device='GPU';scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(1,.84,.68,1);scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.025
for o in list(scene.objects):
 if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
color=(.73,.65,.53) if STEM=='hall' else (.70,.60,.47)
wallmat=bpy.data.materials.new('Closed ceiling mineral plaster');wallmat.use_nodes=True;wallmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
def box(name,pos,size,mat,bevel=.018):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(pos));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  m=o.modifiers.new('Hand eased plaster edge','BEVEL');m.width=bevel;m.segments=3;bpy.ops.object.modifier_apply(modifier=m.name)
  m=o.modifiers.new('Soft weighted face normals','WEIGHTED_NORMAL');m.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=m.name)
 return o
removed=[]
for o in list(scene.objects):
 if o.type=='MESH' and any(s in o.data.materials[0].name.lower() for s in ['olive leaves','olive bark','skylight glass']):removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
# Solid continuous backing plus layered plaster coffer rims. Nothing above opens to sky.
if STEM=='hall':
 box('Closed continuous hall ceiling',(0,6.68,.1),(4.58,.12,11.58),wallmat,.024)
 for a,b in [(-5.45,-1.80),(-1.70,1.95),(2.05,5.65)]:
  for x in [-2.015,2.015]:
   box('Coffer long rolled plaster rim',(x,6.52,(a+b)/2),(.115,.13,b-a),wallmat,.03)
   box('Coffer fine outer bead',(x+(.09 if x>0 else -.09),6.56,(a+b)/2),(.038,.065,b-a),wallmat,.012)
  for z in [a+.04,b-.04]:box('Coffer cross plaster rim',(0,6.52,z),(4.02,.13,.11),wallmat,.03)
else:
 box('Closed continuous salon ceiling',(0,5.88,0),(3.78,.18,8.36),wallmat,.024)
 for a,b in [(-4.05,-.10),(.10,4.05)]:
  for x in [-1.55,1.55]:box('Salon recessed plaster rim',(x,5.71,(a+b)/2),(.12,.15,b-a),wallmat,.026)
  for z in [a+.06,b-.06]:box('Salon coffer cross rim',(0,5.71,z),(3.10,.15,.13),wallmat,.026)
# No daylight/Sun light: asymmetric interior softboxes and warm concealed coves.
def area(name,pos,target,power,size,color=(1,.90,.77),size_y=None):
 bpy.ops.object.light_add(type='AREA',location=xyz(pos));o=bpy.context.object;o.name=name;o.rotation_euler=(Vector(xyz(target))-o.location).to_track_quat('-Z','Y').to_euler();o.data.energy=power*.38;o.data.color=color;o.data.shape='RECTANGLE';o.data.size=size;o.data.size_y=size_y or size
roof=6.35 if STEM=='hall' else 5.42
for z in [-3.65,.08,3.85]:area('Concealed coffer soft light',(0,roof,z),(0,0,z-1.1),500 if STEM=='hall' else 420,3.2,(1,.91,.81),2.9)
area('Interior oblique key',(3.8,5.1,5.3),(-2,0,-3),1600 if STEM=='hall' else 1300,3.5,(1,.87,.70),2.6)
for side in [-1,1]:
 area('Warm lateral ceiling bounce',(side*5.45,4.96,0),(side*2.9,6,0),280,5.5,(1,.79,.55),.5)
 for z in [6,2,-1.5]:area('Broad restrained wall wash',(side*4.85,4.72,z),(side*5.86,2.75,z),55,1.5,(1,.88,.72),.60)
 area('Alcove warm bounce',(side*8,4.96,-6.5),(side*9.8,2.8,-6.5),125,2.4,(1,.86,.68),1.4)
# Bake closure only in the final module, retain a separate terminal asset contract.
cap=None
if STEM=='extension':cap=box('Terminal plaster closure',(0,3.4,9.195),(3.48,6.8,.37),wallmat,0)

# The detailed standalone trees receive/bake their exact contact shadows, never export twice.
shadow_trees=[]
for x,z,scale,rotation in [(-5,4.1,.9,.4),(5,4.1,.9,2.8),(-5,-8,.78,1.5),(5,-8,.78,4.7)]:
 before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/museum/olive-detailed.glb'))
 imported=set(scene.objects)-before
 for obj in imported:
  if obj.parent is None:obj.location=xyz((x,0,z));obj.scale=(scale,scale,scale);obj.rotation_euler.z+=rotation if STEM=='extension' else 0
  obj['interiorShadowOnly']=True
 shadow_trees.extend(imported)
# Source data: one material per original mesh, no prior AO colors or atlas albedo.
groups={'walls':[],'floor':[],'furniture':[]};specs={}
def specification(name):
 lower=name.lower()
 if 'plaster' in lower:return ('walls',None,color,1,.92,.0)
 if 'mortar' in lower:return ('floor','mortar',(.59,.51,.40),1,.90,0)
 if any(s in lower for s in ['sand travertine','clay floor']):return ('floor','stone',(.83,.87,.92) if STEM=='hall' else (.85,.83,.77),1.2,.82,.14)
 if 'travertine base' in lower:return ('floor','stone',(.72,.74,.76),1.2,.54,.12)
 if 'walnut' in lower:return ('furniture','wood',(.42,.25,.13),1,.62,.25)
 if 'linen' in lower:return ('furniture','linen',(.88,.82,.72),.032,.94,.12)
 if 'jute' in lower:return ('furniture','jute',(.66,.48,.28) if 'border' in lower else (.83,.67,.44),.12,.96,.20)
 if 'planter' in lower:return ('furniture','stone',(.79,.76,.68),1.2,.78,.12)
 if 'limestone sculpture' in lower:return ('furniture','stone',(.94,.91,.80),.7,.68,.10)
 if 'soil' in lower:return ('furniture','soil',(.10,.075,.045),1,1,0)
 if 'paper' in lower:return ('furniture','paper',(.77,.71,.60),1,.90,0)
 if 'book cover' in lower:
  i=int(name[-1]);return ('furniture','book',[(.25,.29,.14),(.39,.22,.11),(.53,.40,.24)][i],1,.82,0)
 if 'terracotta' in lower:return ('furniture','ceramic',(.42,.23,.12),1,.56,0)
 return ('furniture','ceramic',(.53,.40,.24),1,.40,0)

def metric_uv(obj,wood=False):
 for uv in list(obj.data.uv_layers):obj.data.uv_layers.remove(uv)
 uv=obj.data.uv_layers.new(name='MetricUV');uv.active_render=True
 # Project each connected timber member separately along its own longest axis.
 parents=list(range(len(obj.data.vertices)))
 def r(i):
  while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
  return i
 for edge in obj.data.edges:
  a,b=map(r,edge.vertices);parents[a]=b
 bounds={}
 world=[obj.matrix_world@v.co for v in obj.data.vertices]
 for i,p in enumerate(world):bounds.setdefault(r(i),[]).append(p)
 spans={k:[max(p[i] for p in pts)-min(p[i] for p in pts) for i in range(3)] for k,pts in bounds.items()}
 for p in obj.data.polygons:
  normal=obj.matrix_world.to_3x3()@p.normal;axis=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=axis]
  if wood:axes.sort(key=lambda i:spans[r(p.vertices[0])][i],reverse=True)
  for i in p.loop_indices:
   point=world[obj.data.loops[i].vertex_index];uv.data[i].uv=(point[axes[0]],point[axes[1]])
 return uv

def pbr(mat,spec):
 group,kind,tint,period,rough,normalstrength=spec;mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear();out=n.new('ShaderNodeOutputMaterial');b=n.new('ShaderNodeBsdfPrincipled');l.new(b.outputs[0],out.inputs['Surface']);b.inputs['Base Color'].default_value=(*tint,1);b.inputs['Roughness'].default_value=rough
 if kind not in {'stone','wood','linen','jute'}:return
 uv=n.new('ShaderNodeUVMap');uv.uv_map='MetricUV';mapping=n.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=1/period;l.new(uv.outputs[0],mapping.inputs[0])
 def tex(suffix,space):
  t=n.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(OUT/'details'/(kind+'-'+suffix+'.webp')),check_existing=True);t.image.colorspace_settings.name=space;l.new(mapping.outputs[0],t.inputs['Vector']);return t
 t=tex('base','sRGB');mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*tint,1);l.new(t.outputs['Color'],mix.inputs[1]);l.new(mix.outputs[0],b.inputs['Base Color'])
 t=tex('normal','Non-Color');normal=n.new('ShaderNodeNormalMap');normal.uv_map='MetricUV';normal.inputs['Strength'].default_value=normalstrength;l.new(t.outputs['Color'],normal.inputs['Color']);l.new(normal.outputs[0],b.inputs['Normal'])
 if kind in {'stone','wood'}:
  t=tex('roughness','Non-Color');multiply=n.new('ShaderNodeMath');multiply.operation='MULTIPLY';multiply.inputs[1].default_value=rough;l.new(t.outputs['Color'],multiply.inputs[0]);l.new(multiply.outputs[0],b.inputs['Roughness'])
for obj in list(scene.objects):
 if obj.type!='MESH' or obj==cap or obj.get('interiorShadowOnly'):continue
 name=obj.data.materials[0].name
 for a in list(obj.data.color_attributes):obj.data.color_attributes.remove(a)
 if 'lamp diffuser' in name.lower():continue
 spec=specification(name);groups[spec[0]].append(obj);metric_uv(obj,spec[1]=='wood')
 for mat in obj.data.materials:
  specs[mat.name]=spec;pbr(mat,spec)
if cap:metric_uv(cap);specs[wallmat.name]=('walls',None,color,1,.92,0)
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

precision=clear_interfaces(groups)
log('INTERFACE_CLEARANCE',precision)
for obj in groups['floor']:
 if obj.data.materials[0].name=='Fine warm mortar':
  inverse=obj.matrix_world.inverted()
  for v in obj.data.vertices:
   p=obj.matrix_world@v.co
   if abs(p.z+.01)<.0001:p.z=.004;v.co=inverse@p
log('REFINED',removed_internal_faces,shifted_ribs,'closed ceilings',removed)
# Save a genuine physically lit source before atlas conversion.
bpy.ops.wm.save_as_mainfile(filepath=str(PRIVATE/(STEM+'-interior-pbr.blend')))
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.location=xyz((.8,1.8,8.2));cam.rotation_euler=(Vector(xyz((-2.2,2.2,-6.5)))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=23
scene.render.resolution_x=1440;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.filepath=str(ROOT/'artifacts/museum'/(STEM+'-interior-pbr.png'));bpy.ops.render.render(write_still=True)
if PREVIEW_ONLY:sys.exit(0)
report={'interfacePrecision':precision,'module':STEM,'closedCeiling':True,'removedOldTreeMeshes':removed,'refinement':{'internalFacesRemoved':removed_internal_faces,'vaultRibsLowered':shifted_ribs,'mortarTopY':.004},'atlases':[],'surfaces':[]}

def surface_material(name,path,uvname,scale,spec):
 group,kind,tint,period,rough,normalstrength=spec
 mat=material(name,path,uvname,scale,tint if group=='walls' else None)
 if group!='walls':
  mat['lightmapRadianceScale']=scale;mat['surfaceKind']=kind;mat['surfaceColorLinear']=list(tint);mat['surfacePeriodMeters']=period;mat['surfaceRoughness']=rough;mat['surfaceNormalStrength']=normalstrength;mat['lightmapTexCoord']=1;mat['lightmapIncludes']='diffuse direct+indirect; no color or normal detail';mat['lightmapUnit']='white diffuse radiance; Three Standard lightMapIntensity=scale*pi'
 return mat

deliveries=[];baked={}
for group in ['walls','floor','furniture']+(['cap'] if cap else []):
 obj=cap if group=='cap' else join(groups[group],('LIGHTMAP ' if group=='walls' else 'SURFACE ')+STEM+' '+group);baked[group]=obj;unwrap(obj,'LightUV');size=512 if group=='cap' else 2048
 image=bpy.data.images.new(STEM+' interior '+group,width=size,height=size,float_buffer=True,alpha=False);image.colorspace_settings.name='Linear Rec.709'
 # Do not bake fine normal maps into the low-frequency irradiance atlas.
 detached=[]
 for mat in obj.data.materials:
  b=mat.node_tree.nodes.get('Principled BSDF')
  for link in list(b.inputs['Normal'].links):detached.append((mat,link.from_socket,link.to_socket));mat.node_tree.links.remove(link)
  node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.nodes.active=node
 select([obj]);scene.render.bake.use_pass_color=False;scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True;scene.render.bake.margin=32;scene.render.bake.margin_type='EXTEND'
 log('INTERIOR_BAKE_BEGIN',group);bpy.ops.object.bake(type='DIFFUSE',use_selected_to_active=False)
 for mat,a,b in detached:mat.node_tree.links.new(a,b)
 image.filepath_raw=str(PRIVATE/(group+'-irradiance.exr'));image.file_format='OPEN_EXR';image.save()
 pixels=np.empty(size*size*4,dtype=np.float32);image.pixels.foreach_get(pixels);rgb=denoise(pixels.reshape(size,size,4)[:,:,:3]);rgb=smooth_irradiance(rgb) if group=='walls' else rgb;scale=max(1,math.ceil(float(np.percentile(rgb,99.98))*4)/4);path=OUT/(STEM+'-'+group+'-light.png');png(path,np.clip(rgb/scale,0,1))
 mats=[]
 for old in obj.data.materials:
  spec=specs[old.name];kind=spec[1];tint=spec[2];name=('LIGHTMAP '+STEM+' '+group) if group in {'walls','cap'} else ('SURFACE '+STEM+' '+kind+' '+str(len(mats)))
  mat=surface_material(name,path,'LightUV',scale,spec);mats.append(mat)
  report['surfaces'].append({'name':name,'kind':kind,'colorLinear':tint,'periodMeters':spec[3],'roughness':spec[4],'normalStrength':spec[5]})
 deliveries.append((obj,mats));report['atlases'].append({'group':group,'size':size,'radianceScale':scale,'path':'/museum/interior/'+path.name})
# Defer material replacement until all bakes finish: preserve physically correct GI.
for obj,mats in deliveries:
 unique=[];lookup={};remap={}
 for i,mat in enumerate(mats):
  keymat=tuple(sorted((k,json.dumps(v.to_list() if hasattr(v,'to_list') else v)) for k,v in mat.items()))
  if keymat not in lookup:lookup[keymat]=len(unique);unique.append(mat)
  remap[i]=lookup[keymat]
 indices=[remap[p.material_index] for p in obj.data.polygons]
 obj.data.materials.clear()
 for mat in unique:obj.data.materials.append(mat)
 for p,i in zip(obj.data.polygons,indices):p.material_index=i
 obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
# Keep bevels sampling their own adjacent planar top, preventing subtexel black specks.
floor=baked['floor'];mesh=floor.data;uv=mesh.uv_layers['LightUV']
parent=list(range(len(mesh.vertices)))
def root(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
for edge in mesh.edges:
 a,b=map(root,edge.vertices);parent[a]=b
components={}
for poly in mesh.polygons:components.setdefault(root(poly.vertices[0]),[]).append(poly)
world=np.array([tuple(floor.matrix_world@v.co) for v in mesh.vertices])
faces=0;loops=0;tiles=0;inset=.035
for polygons in components.values():
 indices=list({v for p in polygons for v in p.vertices});points=world[indices];lo=points.min(axis=0);hi=points.max(axis=0)
 if abs(hi[2]-.0065)>.00005 or abs((hi[2]-lo[2])-.025)>.00005 or max(hi[:2]-lo[:2])>1.001:continue
 top=[p for p in polygons if p.normal.z>.999 and all(abs(world[i,2]-hi[2])<.00005 for i in p.vertices)]
 if len(top)!=1:raise RuntimeError(f'Expected one planar top face, found {len(top)}')
 top=top[0];top_points=world[list(top.vertices)];top_uv=np.array([tuple(uv.data[i].uv) for i in top.loop_indices])
 # UV = affine(world X,Y), valid across the full planar top of this tile.
 A=np.c_[top_points[:,:2],np.ones(len(top_points))];transform=np.linalg.lstsq(A,top_uv,rcond=None)[0]
 lower=top_points[:,:2].min(axis=0)+inset;upper=top_points[:,:2].max(axis=0)-inset
 for poly in polygons:
  if poly==top or poly.normal.z<-.001 or max(world[i,2] for i in poly.vertices)<.0039:continue
  for i in poly.loop_indices:
   p=np.clip(world[mesh.loops[i].vertex_index,:2],lower,upper);v=np.r_[p,1]@transform;uv.data[i].uv=v;loops+=1
  faces+=1
 tiles+=1
mesh.update()

report['wallEdgeUV']=protect_thin_wall_uv(baked['walls'])
report['mortarUV']=repair_mortar_irradiance(floor)
report['floorBevelUV']={'tileCount':tiles,'retargetedFaces':faces,'retargetedLoops':loops,'insetMeters':inset}
# Export the terminal closure separately with the new closed-interior lighting.
if cap:
 select([cap]);bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/museum/end-cap-interior.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=90,export_vertex_color='NONE',export_draco_mesh_compression_enable=True,export_draco_position_quantization=20,export_draco_texcoord_quantization=16)
 cap.hide_render=True;cap.hide_set(True)
objects=[o for o in scene.objects if o!=cap and not o.get('interiorShadowOnly') and o.type in {'MESH','EMPTY'}];select(objects)
path=ROOT/'public/museum'/(STEM+'-interior.glb')
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=90,export_vertex_color='NONE',export_texcoords=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
bpy.ops.wm.save_as_mainfile(filepath=str(PRIVATE/(STEM+'-interior.blend')))
report['bytes']=path.stat().st_size;report['seconds']=time.time()-START;(OUT/(STEM+'-report.json')).write_text(json.dumps(report,indent=2));log('INTERIOR_FINISHED',json.dumps(report))
