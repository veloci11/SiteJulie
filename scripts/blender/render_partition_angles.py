"""Read-only source composition proof; run after atlas jobs, not during GPU QA."""
import bpy,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
stem=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'hall'
source=ROOT/'assets/museum/contemporary-experiments'/stem/(stem+'-contemporary-pbr.blend')
bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
scene.cycles.device='GPU'
def xyz(p):return Vector((p[0],-p[2],p[1]))
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera
camera.location=xyz((0,2.35,-6.8));camera.rotation_euler=(xyz((0,1.7,3.1))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=23
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.filepath=str(ROOT/'artifacts/museum'/(stem+'-partition-reverse.png'))
bpy.ops.render.render(write_still=True)
