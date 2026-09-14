"""Experimental Cycles diffuse GI atlases, preserving authored geometry and originals.
Blender --background --python scripts/blender/bake_lighting.py -- hall
"""
import bpy, math, json, sys, time, struct, zlib
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
STEM=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'hall'
OUT=ROOT/'public/museum/bakes'; OUT.mkdir(exist_ok=True)
PRIVATE=ROOT/'assets/museum/bake-experiments'/STEM;PRIVATE.mkdir(parents=True,exist_ok=True)
START=time.time()
def xyz(p):return (p[0],-p[2],p[1])
def log(*args):print('GI_BAKE',*args,flush=True)
def linear_png(path,pixels,size):
 """Encode scene-linear radiance explicitly to sRGB, without byte Image ambiguity."""
 linear=pixels[:,:3].reshape(size,size,3)[::-1]
 srgb=np.where(linear<=.0031308,linear*12.92,1.055*np.power(linear,1/2.4)-.055)
 rgb=np.uint8(np.clip(np.rint(srgb*255),0,255))
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 raw=b''.join(b'\x00'+row.tobytes() for row in rgb)
 path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum'/(STEM+'.blend')))
EXCLUDED=['Coastal limestone','Distant warm island'] if STEM=='outside' else []
for obj in list(bpy.context.scene.objects):
 if obj.type=='MESH' and any(m.name in EXCLUDED for m in obj.data.materials):bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64
scene.cycles.use_denoising=True;scene.cycles.max_bounces=8;scene.cycles.diffuse_bounces=6
scene.cycles.transparent_max_bounces=8
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='METAL';prefs.get_devices()
for device in prefs.devices:device.use=device.type=='METAL'
scene.cycles.device='GPU'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=0

# Bind every original sampler to preserved metric coordinates before atlas creation.
for o in scene.objects:
 if o.type!='MESH':continue
 if o.data.uv_layers.active:o.data.uv_layers.active.name='SourceUV'
 for mat in o.data.materials:
  if not mat or not mat.use_nodes:continue
  n=mat.node_tree.nodes;l=mat.node_tree.links
  uv=n.new('ShaderNodeUVMap');uv.uv_map='SourceUV'
  for tex in list(n):
   if tex.type=='TEX_IMAGE' and not tex.inputs['Vector'].is_linked:l.new(uv.outputs[0],tex.inputs['Vector'])
 # Old sparse vertex AO must not be multiplied into irradiance.
 for attr in list(o.data.color_attributes):o.data.color_attributes.remove(attr)

for mat in bpy.data.materials:
 if not mat.use_nodes:continue
 category=None;tint=(1,1,1,1)
 if 'plaster' in mat.name.lower():
  category='plaster';tint=(.91,.81,.66,1) if STEM!='extension' else (.76,.57,.40,1)
 elif 'travertine' in mat.name.lower():category='travertine';tint=(.76,.65,.49,1)
 elif mat.name=='Natural walnut grain':category='walnut';tint=(.3,.17,.085,1)
 if not category:continue
 n=mat.node_tree.nodes;l=mat.node_tree.links;b=n.get('Principled BSDF')
 uv=n.new('ShaderNodeUVMap');uv.uv_map='SourceUV'
 mapping=n.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=4/(1.2 if category=='travertine' else 1)
 l.new(uv.outputs[0],mapping.inputs[0])
 maps={}
 for name in ['base_color','normal_gl','roughness']:
  img=bpy.data.images.load(str(ROOT/'assets/materials/pbr'/category/(name+'.png')),check_existing=True)
  img.colorspace_settings.name='sRGB' if name=='base_color' else 'Non-Color'
  tex=n.new('ShaderNodeTexImage');tex.image=img;l.new(mapping.outputs[0],tex.inputs['Vector']);maps[name]=tex
 tintnode=n.new('ShaderNodeMixRGB');tintnode.blend_type='MULTIPLY';tintnode.inputs[0].default_value=1;tintnode.inputs[2].default_value=tint
 l.new(maps['base_color'].outputs['Color'],tintnode.inputs[1]);l.new(tintnode.outputs[0],b.inputs['Base Color'])
 if category=='plaster':
  soften=n.new('ShaderNodeMixRGB');soften.blend_type='MIX';soften.inputs[0].default_value=.18
  soften.inputs[1].default_value=(.72,.61,.47,1) if STEM!='extension' else (.58,.40,.255,1)
  l.new(tintnode.outputs[0],soften.inputs[2]);l.new(soften.outputs[0],b.inputs['Base Color'])
 normal=n.new('ShaderNodeNormalMap');normal.uv_map='SourceUV';normal.inputs['Strength'].default_value=.13 if category=='plaster' else .45
 l.new(maps['normal_gl'].outputs['Color'],normal.inputs['Color']);l.new(normal.outputs[0],b.inputs['Normal'])
 l.new(maps['roughness'].outputs['Color'],b.inputs['Roughness'])
 if category=='travertine':
  rough=n.new('ShaderNodeMath');rough.operation='MAXIMUM';rough.inputs[1].default_value=.45
  l.new(maps['roughness'].outputs['Color'],rough.inputs[0]);l.new(rough.outputs[0],b.inputs['Roughness'])

world=scene.world or bpy.data.worlds.new('Mediterranean daylight GI');scene.world=world;world.use_nodes=True
world.node_tree.nodes.get('Background').inputs[0].default_value=(.64,.76,1,1)
world.node_tree.nodes.get('Background').inputs[1].default_value=.45
bpy.ops.object.light_add(type='SUN',location=xyz((-4,14,8)));sun=bpy.context.object
sun.data.energy=4.5;sun.data.color=(1,.86,.69);sun.data.angle=.065
sun.rotation_euler=(Vector(xyz((0,0,-1)))-sun.location).to_track_quat('-Z','Y').to_euler()
# Broad skylight contribution and soft doorway spill, both baked with occlusion.
interior_lights=[] if STEM=='outside' else [((0,6.2,0),(0,0,0),300,5),((0,3.5,10),(0,2,0),350,3),((-8,4,-6.5),(-9.8,2,-6.5),100,2),((8,4,-6.5),(9.8,2,-6.5),100,2)]
for pos,target,power,size in interior_lights:
 bpy.ops.object.light_add(type='AREA',location=xyz(pos));light=bpy.context.object
 light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.data.color=(1,.91,.78)
 light.rotation_euler=(Vector(xyz(target))-light.location).to_track_quat('-Z','Y').to_euler()
for o in scene.objects:
 if o.type=='MESH' and any('glass' in m.name.lower() for m in o.data.materials):o.visible_shadow=False
bpy.ops.object.camera_add(location=xyz((0,2.25,.6) if STEM=='outside' else (1.0,1.9,8.0)));cam=bpy.context.object;cam.data.lens=22
cam.rotation_euler=(Vector(xyz((0,.6,8) if STEM=='outside' else (-.4,2.2,-3.6)))-cam.location).to_track_quat('-Z','Y').to_euler();scene.camera=cam
scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.filepath=str(ROOT/'artifacts/museum'/(STEM+'-gi-cycles.png'))
log('RENDER_BEGIN',STEM);bpy.ops.render.render(write_still=True);log('RENDER_DONE',time.time()-START)

groups={'shell':[],'furniture':[]}
for o in list(scene.objects):
 if o.type!='MESH':continue
 name=o.data.materials[0].name.lower()
 if 'leaves' in name or 'glass' in name or 'lamp diffuser' in name:continue
 shell=any(t in name for t in ['plaster','travertine base','mortar','sand travertine','clay floor'])
 groups['shell' if shell else 'furniture'].append(o)
report={'module':STEM,'samples':64,'device':'Apple M1 Pro Metal','pass':'DIFFUSE COLOR DIRECT INDIRECT','retainedGeometryChanged':False,'excludedMaterials':EXCLUDED,'lighting':'sun and world sky only' if STEM=='outside' else 'sun, world sky and interior soft fill','atlases':[]}
deliveries=[]
for group,objects in groups.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();obj=bpy.context.object
 obj.name='BAKED '+STEM+' '+group
 uv=obj.data.uv_layers.new(name='BakeUV');obj.data.uv_layers.active=uv;uv.active_render=True
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
 bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.004,area_weight=1,correct_aspect=True,scale_to_bounds=True)
 bpy.ops.object.mode_set(mode='OBJECT')
 size=4096 if group=='shell' else 2048
 img=bpy.data.images.new(STEM+' '+group+' linear GI',width=size,height=size,float_buffer=True,alpha=False)
 img.colorspace_settings.name='Linear Rec.709'
 for mat in obj.data.materials:
  node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=img;mat.node_tree.nodes.active=node
 scene.render.bake.use_pass_color=True;scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True
 scene.render.bake.margin=24;scene.render.bake.margin_type='EXTEND';scene.render.bake.use_clear=True
 log('ATLAS_BEGIN',group,size,len(obj.data.polygons));bpy.ops.object.bake(type='DIFFUSE',use_selected_to_active=False)
 img.filepath_raw=str(PRIVATE/(group+'-radiance.exr'));img.file_format='OPEN_EXR';img.save()
 pixels=np.empty(size*size*4,dtype=np.float32);img.pixels.foreach_get(pixels);pixels=pixels.reshape(-1,4)
 maximum=float(pixels[:,:3].max());percentile=float(np.percentile(pixels[:,:3],99.98))
 scale=max(1.,math.ceil(percentile*4)/4)
 normalized=np.clip(pixels[:,:3]/scale,0,1);pixels[:,:3]=normalized;pixels[:,3]=1
 atlaspath=OUT/(STEM+'-'+group+'.png');linear_png(atlaspath,pixels,size)
 atlas=bpy.data.images.load(str(atlaspath),check_existing=False)
 atlas.name=STEM+' '+group+' baked radiance';atlas.colorspace_settings.name='sRGB';atlas.pack()
 mat=bpy.data.materials.new('BAKED '+STEM+' '+group);mat.use_nodes=True
 mat['bakeRadianceScale']=scale;mat['bakeIncludes']='diffuse albedo + direct + indirect';mat['runtimeMaterial']='MeshBasicMaterial toneMapped=true vertexColors=false'
 n=mat.node_tree.nodes;l=mat.node_tree.links;b=n.get('Principled BSDF');b.inputs['Roughness'].default_value=1
 tex=n.new('ShaderNodeTexImage');tex.image=atlas;uvn=n.new('ShaderNodeUVMap');uvn.uv_map='BakeUV';l.new(uvn.outputs[0],tex.inputs['Vector']);l.new(tex.outputs[0],b.inputs['Base Color'])
 deliveries.append((obj,mat))
 samples=[]
 for desired in [.1,.3,.6]:
  index=int(np.argmin(np.abs(normalized.mean(axis=1)-desired)))
  samples.append({'x':index%size,'y':size-1-index//size,'expectedLinear':normalized[index].tolist()})
 report['atlases'].append({'group':group,'resolution':size,'radianceScale':scale,'maxRadiance':maximum,'percentile9998':percentile,'path':'/museum/bakes/'+STEM+'-'+group+'.png','pixelProbes':samples})
 log('ATLAS_DONE',group,scale,maximum,time.time()-START)

# Material replacement is deferred: every atlas sees the same original bounce colors.
for obj,mat in deliveries:
 obj.data.materials.clear();obj.data.materials.append(mat)
 for p in obj.data.polygons:p.material_index=0
 obj.data.uv_layers.remove(obj.data.uv_layers.get('SourceUV'))
bpy.ops.wm.save_as_mainfile(filepath=str(PRIVATE/(STEM+'-baked.blend')))
target=ROOT/'public/museum'/(STEM+'-baked.glb')
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=94,export_vertex_color='NONE',export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
report['bytes']=target.stat().st_size;report['seconds']=time.time()-START
(OUT/(STEM+'-report.json')).write_text(json.dumps(report,indent=2))
log('FINISHED',json.dumps(report))
