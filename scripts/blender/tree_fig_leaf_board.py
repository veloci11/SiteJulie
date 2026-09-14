"""CPU-only visual board extracted from the final .blend; never writes a GLB."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum/trees/fig-reading/fig-source.blend'))
leaves=[o for o in bpy.context.scene.objects if o.type=='MESH' and 'laminae' in o.name]
examples={}
for obj in leaves:
 me=obj.data;adj=[[] for _ in me.vertices]
 for edge in me.edges:
  a,b=edge.vertices;adj[a].append(b);adj[b].append(a)
 seen=set()
 for start in range(len(adj)):
  if start in seen:continue
  component={start};stack=[start];seen.add(start)
  while stack:
   for other in adj[stack.pop()]:
    if other not in seen:seen.add(other);component.add(other);stack.append(other)
  polygons=[p for p in me.polygons if p.vertices[0] in component]
  shape=int(me.uv_layers.active.data[polygons[0].loop_start].uv.x*3)
  if shape in examples:continue
  normal=Vector((0,0,0))
  for p in polygons:normal+=p.normal*p.area
  rotation=normal.normalized().rotation_difference(Vector((0,0,1)))
  center=sum((me.vertices[i].co for i in component),Vector((0,0,0)))/len(component)
  order=sorted(component);mapping={old:new for new,old in enumerate(order)}
  coords=[rotation@(me.vertices[i].co-center) for i in order]
  examples[shape]=(obj,order,mapping,polygons,coords)
for obj in list(bpy.context.scene.objects):obj.hide_render=True
textmat=bpy.data.materials.new('QA label charcoal');textmat.use_nodes=True;textmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.018,.018,.014,1)
for shape,(source,order,mapping,polygons,coords) in examples.items():
 for back in [False,True]:
  me=bpy.data.meshes.new('QA lamina');me.from_pydata(coords,[],[tuple(mapping[i] for i in p.vertices) for p in polygons]);me.update();me.materials.append(source.data.materials[0])
  uv=me.uv_layers.new(name='UVMap');col=me.color_attributes.new(name='Tint',type='FLOAT_COLOR',domain='POINT')
  for i,old in enumerate(order):col.data[i].color=source.data.color_attributes['Tint'].data[old].color
  for out,p in zip(me.polygons,polygons):
   out.use_smooth=True
   for newloop,oldloop in zip(out.loop_indices,p.loop_indices):uv.data[newloop].uv=source.data.uv_layers.active.data[oldloop].uv
  obj=bpy.data.objects.new('Reverse' if back else 'Front',me);bpy.context.collection.objects.link(obj);obj.location=((shape-1)*.43,-.20 if back else .24,.10);obj.rotation_euler.y=math.pi if back else 0
  # Real centimetre metric; no enlarged/repainted artwork used anywhere.
  bpy.ops.object.text_add(location=((shape-1)*.43-.16,(-.20 if back else .24)-.21,.11));label=bpy.context.object;label.data.body=['5 lobes larges','5 lobes incises','3 lobes jeunes'][shape]+(' / revers' if back else ' / face');label.data.size=.027;label.data.materials.append(textmat)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=20;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=1200;scene.render.resolution_y=820;scene.render.resolution_percentage=100
scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.55,.61,.7,1);scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.5
mat=bpy.data.materials.new('QA neutral backdrop');mat.diffuse_color=(.23,.22,.20,1)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.05));bpy.context.object.data.materials.append(mat)
for pos,power,size in [((-.7,1.2,2),90,2),((1,-.2,1),30,1)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,0,2));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=1.42;scene.camera=camera;scene.render.filepath=str(ROOT/'artifacts/fig-qa/fig-leaf-front-reverse.png');bpy.ops.render.render(write_still=True)
