"""CPU-only ceiling end correction on the existing extension irradiance.
The old ceiling front end at global Z8.85 was coplanar with the hall front wall.
Move both ceiling ends 15cm inside the shared wall, retaining bevels/UV/atlas.
"""
import bpy,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
private=ROOT/'assets/museum/contemporary-experiments/extension'
counts={}
for kind in ['pbr','final']:
 path=private/('extension-contemporary-pbr.blend' if kind=='pbr' else 'extension-contemporary.blend');bpy.ops.wm.open_mainfile(filepath=str(path));changed=0
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  indices=set()
  if kind=='pbr' and o.name=='Continuous contemporary ceiling':indices=set(range(len(o.data.vertices)))
  elif kind=='final':
   for p in o.data.polygons:
    mat=o.data.materials[p.material_index];t=mat.get('plasterColorLinear')
    if t and max(abs(a-b) for a,b in zip(t,[.74,.74,.71]))<1e-7:indices.update(p.vertices)
  inv=o.matrix_world.inverted()
  for i in indices:
   v=o.data.vertices[i];world=o.matrix_world@v.co
   if abs(world.y)>9.1:world.y-=math.copysign(.15,world.y);v.co=inv@world;changed+=1
  o.data.update()
 counts[kind]=changed
 assert changed>0,'No ceiling end vertices found; do not reapply this correction'
 if kind=='final':
  objects=[o for o in bpy.context.scene.objects if o.name!='Terminal plaster closure' and not o.get('interiorShadowOnly') and o.type in {'MESH','EMPTY'}]
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0]
  bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/museum/extension-contemporary.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=90,export_vertex_color='NONE',export_texcoords=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
 bpy.ops.wm.save_as_mainfile(filepath=str(path))
rpath=ROOT/'public/museum/contemporary/extension-report.json';r=json.loads(rpath.read_text());r['bytes']=(ROOT/'public/museum/extension-contemporary.glb').stat().st_size;r['junctionCorrection']={'ceilingZExtent':[-9,9],'movedVertices':counts,'irradiancePreserved':True};rpath.write_text(json.dumps(r,indent=2));print('JUNCTION_FIXED',counts,flush=True)
