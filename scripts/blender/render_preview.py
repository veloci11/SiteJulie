"""Render authored room sources for composition review; does not modify exports."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
def xyz(p):return (p[0],-p[2],p[1])
for stem in ['hall','extension']:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum'/(stem+'.blend')))
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
 scene.cycles.use_denoising=True
 for o in scene.objects:
  if o.type=='MESH' and any('glass' in m.name.lower() for m in o.data.materials):o.visible_shadow=False
 world=scene.world or bpy.data.worlds.new('Mediterranean sky');scene.world=world;world.use_nodes=True
 world.node_tree.nodes.get('Background').inputs[0].default_value=(.62,.72,.84,1)
 world.node_tree.nodes.get('Background').inputs[1].default_value=.35
 bpy.ops.object.light_add(type='SUN',location=xyz((-6,12,5)));sun=bpy.context.object;sun.data.energy=3.8;sun.data.color=(1,.79,.55);sun.data.angle=.13
 sun.rotation_euler=(Vector(xyz((1,0,-3)))-sun.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.light_add(type='AREA',location=xyz((0,6.2,0)));area=bpy.context.object;area.data.energy=700;area.data.shape='RECTANGLE';area.data.size=4;area.data.size_y=8;area.data.color=(1,.87,.69)
 bpy.ops.object.camera_add(location=xyz((1.15,2.1,7.7)));cam=bpy.context.object;cam.data.lens=23.5;cam.rotation_euler=(Vector(xyz((-.4,2.4,-4.5)))-cam.location).to_track_quat('-Z','Y').to_euler();scene.camera=cam
 scene.render.resolution_x=1200;scene.render.resolution_y=750;scene.render.resolution_percentage=100
 scene.render.filepath=str(ROOT/'artifacts/museum'/('v2-'+stem+'-blender.png'));bpy.ops.render.render(write_still=True)
