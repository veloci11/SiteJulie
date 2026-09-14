"""Published paintings added to a read-only source render, never baked/exported."""
import bpy,math,json,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
stem=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'hall';module='hall' if stem=='hall' else 'extension'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum/contemporary-experiments'/stem/(stem+'-contemporary-pbr.blend')))
scene=bpy.context.scene;layout=json.loads((ROOT/'artifacts/museum/source-artwork-layout.json').read_text())
def xyz(p):return Vector((p[0],-p[2],p[1]))
for a in layout['artworks']:
 if a['module']!=module:continue
 theta=a['rotationY'];right=Vector((math.cos(theta),0,-math.sin(theta)));normal=Vector((math.sin(theta),0,math.cos(theta)));center=Vector(a['position'])+normal*layout['imageDepth']
 vertices=[xyz(center+right*u+Vector((0,v,0))) for u,v in [(-a['width']/2,-a['height']/2),(a['width']/2,-a['height']/2),(a['width']/2,a['height']/2),(-a['width']/2,a['height']/2)]]
 mesh=bpy.data.meshes.new('Visibility only '+a['id']);mesh.from_pydata(vertices,[],[(0,1,2,3)]);uv=mesh.uv_layers.new(name='UV')
 for i,p in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[i].uv=p
 obj=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(obj)
 mat=bpy.data.materials.new(mesh.name);mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/a['image']));mat.node_tree.links.new(tex.outputs['Color'],em.inputs['Color']);lp=nodes.new('ShaderNodeLightPath');mat.node_tree.links.new(lp.outputs['Is Camera Ray'],em.inputs['Strength']);mat.node_tree.links.new(em.outputs[0],out.inputs['Surface']);mesh.materials.append(mat)
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
scene.cycles.device='GPU';bare='--removed-relief' in sys.argv;side=1 if bare else (-1 if module=='hall' else 1)
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.location=xyz((-side*2.4,1.85,-4.8));cam.rotation_euler=(xyz((side*5.7,2.2,4 if bare and module=='hall' else 2.1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=27
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.filepath=str(ROOT/'artifacts/museum'/(stem+('-bare-wall.png' if bare else '-shallow-oblique.png')));bpy.ops.render.render(write_still=True)
