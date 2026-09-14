"""CPU-only final mortar radiance fix; no rebake and no asset texture changes."""
import bpy,sys,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];STEM=sys.argv[sys.argv.index('--')+1];sys.path.insert(0,str(ROOT/'scripts/blender'))
from interior_precision import repair_mortar_irradiance
private=ROOT/'assets/museum/interior-experiments'/STEM
bpy.ops.wm.open_mainfile(filepath=str(private/(STEM+'-interior.blend')))
obj=bpy.data.objects['SURFACE '+STEM+' floor'];report=repair_mortar_irradiance(obj)
objects=[o for o in bpy.context.scene.objects if o.name!='Terminal plaster closure' and not o.get('interiorShadowOnly') and o.type in {'MESH','EMPTY'}]
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=obj
path=ROOT/'public/museum'/(STEM+'-interior.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=90,export_vertex_color='NONE',export_texcoords=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
bpy.ops.wm.save_as_mainfile(filepath=str(private/(STEM+'-interior.blend')))
p=ROOT/'public/museum/interior'/(STEM+'-report.json');data=json.loads(p.read_text());data['mortarUV']=report;data['bytes']=path.stat().st_size;p.write_text(json.dumps(data,indent=2));print('MORTAR_IRRADIANCE_REPAIRED',STEM,report,path.stat().st_size,flush=True)
