"""CPU-only longitudinal mortar correction for an already baked source.
The main builder now authors the same [-9,9] bound directly; no new bake needed.
"""
import bpy,sys,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];stem=sys.argv[sys.argv.index('--')+1]
path=ROOT/'assets/museum/contemporary-experiments'/stem/(stem+'-contemporary.blend');bpy.ops.wm.open_mainfile(filepath=str(path));count=0
for obj in bpy.context.scene.objects:
 if obj.type!='MESH':continue
 materials={i for i,m in enumerate(obj.data.materials) if m.get('surfaceKind')=='mortar'}
 if not materials:continue
 inverse=obj.matrix_world.inverted();indices=set()
 for p in obj.data.polygons:
  if p.material_index in materials and p.normal.z>.999:indices.update(p.vertices)
 for i in indices:
  v=obj.data.vertices[i];p=obj.matrix_world@v.co
  if abs(p.z-.004)<.0001 and abs(p.y)>9.000001:
   p.y=max(-9,min(9,p.y));v.co=inverse@p;count+=1
 obj.data.update()
objects=[o for o in bpy.context.scene.objects if not o.get('interiorShadowOnly') and o.type in {'MESH','EMPTY'}];bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/museum'/(stem+'-contemporary.glb')),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=90,export_vertex_color='NONE',export_texcoords=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
bpy.ops.wm.save_as_mainfile(filepath=str(path));reportpath=ROOT/'public/museum/contemporary'/(stem+'-report.json');r=json.loads(reportpath.read_text());r['mortarUV']['planeBoundsChanged']=True;r['mortarUV']['moduleLongitudinalBounds']=[-9,9];r['mortarUV']['clippedBoundaryVertices']=count;r['bytes']=(ROOT/'public/museum'/(stem+'-contemporary.glb')).stat().st_size;reportpath.write_text(json.dumps(r,indent=2));print('MORTAR_BOUNDARY_CLIPPED',count)
