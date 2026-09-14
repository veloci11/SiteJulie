"""Repair authored lathe winding; rebake furniture only, preserving walls/floor UV+images."""
import ast
from pathlib import Path
source=Path(__file__).with_name('build_contemporary_rooms.py').read_text()
exec(source.split('bpy.ops.wm.open_mainfile')[0])
for node in ast.parse(source).body:
 if isinstance(node,ast.FunctionDef) and node.name in ['pbr','specification']:exec(compile(ast.Module(body=[node],type_ignores=[]),str(__file__),'exec'))
existing=json.loads((OUT/(STEM+'-report.json')).read_text())
if existing.get('outwardLatheNormals') or existing.get('authoredLatheWinding')=='outward':raise RuntimeError('Lathe normals already corrected; do not invert them twice. Use the complete builder for a fresh bake.')
color=(.68,.595,.48) if STEM=='hall' else (.63,.485,.385)
physical=PRIVATE/(STEM+'-contemporary-pbr.blend');final=PRIVATE/(STEM+'-contemporary.blend')
def reverse_faces(obj,indices):
 bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table();faces=[bm.faces[i] for i in indices];bmesh.ops.reverse_faces(bm,faces=faces);bm.normal_update();bm.to_mesh(obj.data);bm.free();obj.data.update()
 # Rebuild corner normals coherently after changing winding; keep broad bench faces flat.
 select([obj]);mod=obj.modifiers.new('Consistent weighted outward normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
def lathe_indices(obj):
 result=[]
 for p in obj.data.polygons:
  m=obj.data.materials[p.material_index];kind=m.get('surfaceKind');t=list(m.get('surfaceColorLinear',[]));target=[.69,.60,.48] if STEM=='hall' else [.56,.38,.27]
  if kind=='ceramic' or (kind=='stone' and len(t)==3 and max(abs(a-b) for a,b in zip(t,target))<1e-7):result.append(p.index)
 return result
bpy.ops.wm.open_mainfile(filepath=str(physical));scene=bpy.context.scene
fixed=[]
for o in list(scene.objects):
 if o.type=='MESH' and (o.name.startswith('Tapered mineral pot') or o.name.startswith('Hand thrown editorial vessel')):

  if not o.get('outwardWindingCorrected'):reverse_faces(o,list(range(len(o.data.polygons))));o['outwardWindingCorrected']=True
  fixed.append(o.name)
assert len(fixed)==4,fixed
bpy.ops.wm.save_as_mainfile(filepath=str(physical))
# Replace the source furniture by the exact exported UV mesh, retaining real PBR surroundings.
for o in list(scene.objects):
 if o.type!='MESH' or o.get('interiorShadowOnly') or o.name=='Terminal plaster closure':continue
 name=o.data.materials[0].name
 if 'lamp diffuser' in name.lower():continue
 if specification(name)[0]=='furniture':bpy.data.objects.remove(o,do_unlink=True)
with bpy.data.libraries.load(str(final),link=False) as (src,dst):dst.objects=[name for name in src.objects if name=='SURFACE '+STEM+' furniture']
obj=dst.objects[0];scene.collection.objects.link(obj);indices=lathe_indices(obj);assert indices;reverse_faces(obj,indices)
for mat in obj.data.materials:
 spec=('furniture',mat['surfaceKind'],list(mat['surfaceColorLinear']),mat['surfacePeriodMeters'],mat['surfaceRoughness'],mat['surfaceNormalStrength']);pbr(mat,spec)
uv=obj.data.uv_layers['LightUV'];obj.data.uv_layers.active=uv;uv.active_render=True
size=2048;image=bpy.data.images.new(STEM+' corrected outward furniture',width=size,height=size,float_buffer=True,alpha=False);image.colorspace_settings.name='Linear Rec.709'
for mat in obj.data.materials:
 bs=mat.node_tree.nodes.get('Principled BSDF')
 for link in list(bs.inputs['Normal'].links):mat.node_tree.links.remove(link)
 node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.nodes.active=node
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
scene.cycles.device='GPU';scene.cycles.samples=128
select([obj]);scene.render.bake.use_pass_color=False;scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True;scene.render.bake.margin=32;scene.render.bake.margin_type='EXTEND'
log('FURNITURE_NORMALS_BAKE',STEM,len(indices));bpy.ops.object.bake(type='DIFFUSE',use_selected_to_active=False)
image.filepath_raw=str(PRIVATE/'furniture-irradiance.exr');image.file_format='OPEN_EXR';image.save()
pixels=np.empty(size*size*4,dtype=np.float32);image.pixels.foreach_get(pixels);rgb=denoise(pixels.reshape(size,size,4)[:,:,:3]);scale=max(1,math.ceil(float(np.percentile(rgb,99.98))*4)/4);path=OUT/(STEM+'-furniture-light.png');png(path,np.clip(rgb/scale,0,1))
# Reopen exact final scene: all other baked materials/images stay untouched.
bpy.ops.wm.open_mainfile(filepath=str(final));obj=bpy.data.objects['SURFACE '+STEM+' furniture'];indices=lathe_indices(obj);reverse_faces(obj,indices)
fresh=bpy.data.images.load(str(path),check_existing=False);fresh.colorspace_settings.name='sRGB';fresh.pack()
for mat in obj.data.materials:
 mat['lightmapRadianceScale']=scale
 for n in mat.node_tree.nodes:
  if n.type=='TEX_IMAGE':n.image=fresh
objects=[o for o in bpy.context.scene.objects if o.name!='Terminal plaster closure' and not o.get('interiorShadowOnly') and o.type in {'MESH','EMPTY'}];select(objects)
path=ROOT/'public/museum'/(STEM+'-contemporary.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=90,export_vertex_color='NONE',export_texcoords=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
bpy.ops.wm.save_as_mainfile(filepath=str(final));rpath=OUT/(STEM+'-report.json');report=json.loads(rpath.read_text());report['bytes']=path.stat().st_size;report['outwardLatheNormals']={'objects':fixed,'faces':len(indices),'furnitureOnlyBakeSeconds':time.time()-START}
for a in report['atlases']:
 if a['group']=='furniture':a['radianceScale']=scale
rpath.write_text(json.dumps(report,indent=2));log('NORMALS_FINAL',STEM,report['outwardLatheNormals'])
