"""Read-only source composition render; never changes a GLB or source blend."""
import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum/contemporary-experiments/hall/hall-contemporary-pbr.blend'))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.device='GPU';scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
def xyz(p):return (p[0],-p[2],p[1])
bpy.ops.object.camera_add(location=xyz((-.1,1.65,.25)));cam=bpy.context.object;cam.rotation_euler=(Vector(xyz((-3.65,1.70,5.4)))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=29;scene.camera=cam
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.filepath=str(ROOT/'artifacts/museum/reading-corner-source.png');bpy.ops.render.render(write_still=True)
