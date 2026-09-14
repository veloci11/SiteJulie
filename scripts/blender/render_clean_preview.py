"""View new smooth irradiance walls with the exact runtime material contract."""
import bpy,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
stem=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'hall'
def xyz(p):return (p[0],-p[2],p[1])
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum/clean-experiments'/stem/(stem+'-clean.blend')))
scene=bpy.context.scene
for mat in bpy.data.materials:
 if not mat.name.startswith(('BAKED ','LIGHTMAP ')):continue
 n=mat.node_tree.nodes;l=mat.node_tree.links;tex=next(x for x in n if x.type=='TEX_IMAGE');out=n.get('Material Output');em=n.new('ShaderNodeEmission')
 if mat.name.startswith('LIGHTMAP '):
  mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1;mult.inputs[2].default_value=(*mat['plasterColorLinear'],1)
  l.new(tex.outputs['Color'],mult.inputs[1]);l.new(mult.outputs[0],em.inputs['Color']);em.inputs['Strength'].default_value=mat['lightmapRadianceScale']
 else:l.new(tex.outputs['Color'],em.inputs['Color']);em.inputs['Strength'].default_value=mat['bakeRadianceScale']
 l.new(em.outputs[0],out.inputs['Surface'])
for obj in scene.objects:
 if obj.type=='MESH' and obj.name.startswith(('LIGHTMAP ','BAKED ')):obj.visible_diffuse=False;obj.visible_glossy=False
 if obj.name=='LIGHTMAP terminal cap':obj.hide_set(False);obj.hide_render=False
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam
shots=[('home',(1,1.9,8),(-.4,2.2,-3.6),22,1200,800),('wall',(-2.8,2.7,2),(-5.85,2.7,2),30,900,900)]
if stem=='extension':shots.append(('closed-end',(1.4,2.2,4.7),(0,2.8,9),24,1100,800))
for label,pos,target,lens,w,h in shots:
 cam.location=xyz(pos);cam.rotation_euler=(Vector(xyz(target))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens
 scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.resolution_percentage=100;scene.render.filepath=str(ROOT/'artifacts/museum'/(stem+'-clean-'+label+'.png'))
 bpy.ops.render.render(write_still=True)
