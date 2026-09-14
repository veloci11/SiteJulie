"""CPU-only candidate: tiny floor bevels inherit their adjacent top-face lighting.
No texture, lighting, geometry, source asset, or runtime changes.
"""
import bpy,sys,json,time
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];stem=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'hall';start=time.time()
out=ROOT/'assets/museum/joint-uv-experiments';out.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum/clean-experiments'/stem/(stem+'-clean.blend')))
floor=bpy.data.objects['BAKED '+stem+' floor'];mesh=floor.data;uv=mesh.uv_layers.active
parent=list(range(len(mesh.vertices)))
def root(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
for edge in mesh.edges:
 a,b=map(root,edge.vertices);parent[a]=b
components={}
for poly in mesh.polygons:components.setdefault(root(poly.vertices[0]),[]).append(poly)
world=np.array([tuple(floor.matrix_world@v.co) for v in mesh.vertices])
faces=0;loops=0;tiles=0;inset=.035
for polygons in components.values():
 indices=list({v for p in polygons for v in p.vertices});points=world[indices];lo=points.min(axis=0);hi=points.max(axis=0)
 if abs(hi[2]-.0065)>.00005 or abs((hi[2]-lo[2])-.025)>.00005 or max(hi[:2]-lo[:2])>1.001:continue
 top=[p for p in polygons if p.normal.z>.999 and all(abs(world[i,2]-hi[2])<.00005 for i in p.vertices)]
 if len(top)!=1:raise RuntimeError(f'Expected one planar top face, found {len(top)}')
 top=top[0];top_points=world[list(top.vertices)];top_uv=np.array([tuple(uv.data[i].uv) for i in top.loop_indices])
 # UV = affine(world X,Y), valid across the full planar top of this tile.
 A=np.c_[top_points[:,:2],np.ones(len(top_points))];transform=np.linalg.lstsq(A,top_uv,rcond=None)[0]
 lower=top_points[:,:2].min(axis=0)+inset;upper=top_points[:,:2].max(axis=0)-inset
 for poly in polygons:
  if poly==top or poly.normal.z<-.001 or max(world[i,2] for i in poly.vertices)<.0039:continue
  for i in poly.loop_indices:
   p=np.clip(world[mesh.loops[i].vertex_index,:2],lower,upper);v=np.r_[p,1]@transform;uv.data[i].uv=v;loops+=1
  faces+=1
 tiles+=1
mesh.update()
objects=[o for o in bpy.context.scene.objects if o.name!='LIGHTMAP terminal cap' and o.type in {'MESH','EMPTY'}]
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:obj.select_set(True)
bpy.context.view_layer.objects.active=floor
path=ROOT/'public/museum'/(stem+'-joints-candidate.glb')
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=88,export_vertex_color='NONE',export_texcoords=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
bpy.ops.wm.save_as_mainfile(filepath=str(out/(stem+'-joints-candidate.blend')))
report={'module':stem,'geometryChanged':False,'texturesChanged':False,'lightingRebaked':False,'tileCount':tiles,'retargetedBevelFaces':faces,'retargetedLoops':loops,'sampleInsetMeters':inset,'bytes':path.stat().st_size,'seconds':time.time()-start}
(out/(stem+'-report.json')).write_text(json.dumps(report,indent=2));print('JOINT_UV_CANDIDATE',json.dumps(report),flush=True)
