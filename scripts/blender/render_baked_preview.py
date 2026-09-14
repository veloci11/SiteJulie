"""Round-trip preview of exported radiance material without a second lighting pass."""
import bpy,sys
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
stem=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'hall'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum/bake-experiments'/stem/(stem+'-baked.blend')))
scene=bpy.context.scene
if stem=='outside':
 scene.camera.location=(-1,4,4)
 scene.camera.data.lens=18
 scene.camera.rotation_euler=(Vector((0,-5,0))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
for mat in bpy.data.materials:
 if not mat.name.startswith('BAKED '):continue
 n=mat.node_tree.nodes;l=mat.node_tree.links
 tex=next(x for x in n if x.type=='TEX_IMAGE')
 out=n.get('Material Output');em=n.new('ShaderNodeEmission');em.inputs['Strength'].default_value=mat['bakeRadianceScale']
 l.new(tex.outputs['Color'],em.inputs['Color']);l.new(em.outputs[0],out.inputs['Surface'])
for obj in scene.objects:
 if obj.type=='MESH' and obj.name.startswith('BAKED '):obj.visible_diffuse=False;obj.visible_glossy=False
scene.render.filepath=str(ROOT/'artifacts/museum'/(stem+'-baked-roundtrip.png'))
bpy.ops.render.render(write_still=True)
