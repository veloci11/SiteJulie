"""Final neutral mortar tint, on the existing irradiance: CPU only."""
import bpy,sys,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];stem=sys.argv[sys.argv.index('--')+1];private=ROOT/'assets/museum/contemporary-experiments'/stem
bpy.ops.wm.open_mainfile(filepath=str(private/(stem+'-contemporary.blend')))
tint=[.47,.447,.39] if stem=='hall' else [.45,.422,.375]
for m in bpy.data.materials:
 if m.get('surfaceKind')=='mortar':m['surfaceColorLinear']=tint
objects=[o for o in bpy.context.scene.objects if o.name!='Terminal plaster closure' and not o.get('interiorShadowOnly') and o.type in {'MESH','EMPTY'}]
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
path=ROOT/'public/museum'/(stem+'-contemporary.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=90,export_vertex_color='NONE',export_texcoords=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
bpy.ops.wm.save_as_mainfile(filepath=str(private/(stem+'-contemporary.blend')))
p=ROOT/'public/museum/contemporary'/(stem+'-report.json');r=json.loads(p.read_text());r['bytes']=path.stat().st_size;r['mortarColorLinear']=tint
for s in r['surfaces']:
 if s['kind']=='mortar':s['colorLinear']=tint
p.write_text(json.dumps(r,indent=2));print('FINAL_MORTAR_TINT',stem,tint,path.stat().st_size,flush=True)
