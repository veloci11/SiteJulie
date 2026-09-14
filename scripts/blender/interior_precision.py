"""Targeted construction clearance and subtexel irradiance protection."""
import bpy,math
import numpy as np
from mathutils import Vector
from mathutils.geometry import closest_point_on_tri

def components(obj):
 parent=list(range(len(obj.data.vertices)))
 def root(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 for e in obj.data.edges:
  a,b=map(root,e.vertices);parent[a]=b
 result={}
 for v in obj.data.vertices:result.setdefault(root(v.index),[]).append(v.index)
 return result,root

def clear_interfaces(groups):
 spandrels=0;plinths=0
 for obj in groups['walls']:
  comps,_=components(obj);inverse=obj.matrix_world.inverted()
  for ids in comps.values():
   if len(ids)!=8:continue
   points=[obj.matrix_world@obj.data.vertices[i].co for i in ids]
   # Blender coordinates X,-Z,Y; recover room coordinates for radial clearance.
   pts=[Vector((p.x,p.z,-p.y)) for p in points];lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
   width=[hi[i]-lo[i] for i in range(3)];mode=None
   if abs(width[0]-.3)<.001 and abs(width[2]-2.6/24)<.001 and abs(hi[1]-4.8)<.001:mode=(2,-6.5,1.3,3.5)
   if abs(width[2]-.15)<.001 and abs(width[0]-3.2/24)<.001 and abs(hi[1]-5.4)<.001:mode=(0,0,1.6,3.8)
   if not mode:continue
   axis,center,r,spring=mode;changed=False
   for index,p in zip(ids,pts):
    u=p[axis]-center;v=p[1]-spring
    # Only the lower circular boundary, not the horizontal masonry crown.
    if abs(math.hypot(u,v)-r)<.0001 and p[1]<spring+r-.0001:
     p[axis]=center+u*(r+.035)/r;p[1]=spring+v*(r+.035)/r
     obj.data.vertices[index].co=inverse@Vector((p.x,-p.z,p.y));changed=True
   spandrels+=int(changed)
  obj.data.update()
 for obj in groups['floor']:
  if 'travertine base' not in obj.data.materials[0].name.lower():continue
  comps,_=components(obj);inverse=obj.matrix_world.inverted()
  for ids in comps.values():
   pts=[obj.matrix_world@obj.data.vertices[i].co for i in ids]
   lo=np.min(np.array(pts),axis=0);hi=np.max(np.array(pts),axis=0)
   if abs((hi[0]-lo[0])-.14)>.001 or abs((hi[2]-lo[2])-.44)>.001:continue
   # Original plinth ends are exactly on the masonry reveal at z -7.8/-5.2.
   end=7.8 if abs(lo[1]-7.8)<.001 else (5.2 if abs(hi[1]-5.2)<.001 else None)
   if end is None:continue
   fixed=hi[1] if end==7.8 else lo[1];new=end+.02 if end==7.8 else end-.02
   for index,p in zip(ids,pts):p.y=fixed+(p.y-fixed)*(new-fixed)/(end-fixed);obj.data.vertices[index].co=inverse@p
   plinths+=1
  obj.data.update()
 return {'clearedSpandrelPanels':spandrels,'radialMasonryClearanceMeters':.035,'shortenedPlinthEnds':plinths,'plinthClearanceMeters':.02}

def smooth_irradiance(rgb):
 # Two-pixel support, on illumination only; weave/wood/stone detail stays independent.
 weights=[.06,.24,.40,.24,.06];a=rgb.copy()
 for axis in [0,1]:
  pad=[(0,0),(0,0),(0,0)];pad[axis]=(2,2);p=np.pad(a,pad,mode='edge');out=np.zeros_like(a)
  for i,w in enumerate(weights):
   cut=[slice(None)]*3;cut[axis]=slice(i,i+a.shape[axis]);out+=p[tuple(cut)]*w
  a=out
 return a

def protect_thin_wall_uv(obj,size=2048):
 mesh=obj.data;uv=mesh.uv_layers['LightUV'];comps,root=components(obj);polys={}
 for p in mesh.polygons:polys.setdefault(root(p.vertices[0]),[]).append(p)
 world=np.array([tuple(obj.matrix_world@v.co) for v in mesh.vertices]);data={};targets=[]
 for p in mesh.polygons:
  coords=np.array([tuple(uv.data[i].uv)*1 for i in p.loop_indices])*size
  area=abs(np.sum(coords[:,0]*np.roll(coords[:,1],-1)-coords[:,1]*np.roll(coords[:,0],-1)))*.5
  longest=max(np.linalg.norm(coords-np.roll(coords,1,axis=0),axis=1));width=2*area/max(longest,1e-8)
  data[p.index]=(area,width)
  if width<2.3:targets.append(p)
 changed=0
 for p in targets:
  center=np.mean(world[list(p.vertices)],axis=0);normal=p.normal
  candidates=[q for q in polys[root(p.vertices[0])] if data[q.index][1]>=3.5 and data[q.index][0]>=16 and q.normal.dot(normal)>.15]
  if not candidates:continue
  def score(q):
   pts=world[list(q.vertices)];lo=pts.min(axis=0);hi=pts.max(axis=0);distance=np.linalg.norm(center-np.clip(center,lo,hi))
   return distance+(1-q.normal.dot(normal))*.05
  q=min(candidates,key=score);qpts=world[list(q.vertices)];quv=np.array([tuple(uv.data[i].uv) for i in q.loop_indices]);qcenter=qpts.mean(axis=0)
  # Closest triangle point keeps the mapping inside its real face, never another island.
  triangles=[(qpts[0],qpts[i],qpts[i+1]) for i in range(1,len(qpts)-1)]
  affine=np.linalg.lstsq(np.c_[qpts,np.ones(len(qpts))],quv,rcond=None)[0]
  radius=max(np.linalg.norm(qpts-qcenter,axis=1));fraction=min(.28,3.5/(max(data[q.index][1],3.5)))
  for li in p.loop_indices:
   point=Vector(world[mesh.loops[li].vertex_index]);projected=min((closest_point_on_tri(point,*map(Vector,t)) for t in triangles),key=lambda a:(a-point).length_squared)
   contracted=np.array(projected)*(1-fraction)+qcenter*fraction
   uv.data[li].uv=np.r_[contracted,1]@affine
  changed+=1
 mesh.update();return {'protectedWallFaces':changed,'minimumAtlasWidthPixels':2.3,'sampleSupportPixels':3.5}

def repair_mortar_irradiance(obj):
 """Keep the mortar plane and tint; sample each local slab's exposed radiance."""
 import bmesh
 mesh=obj.data;uv=mesh.uv_layers['LightUV'];comps,root=components(obj);polys={}
 for p in mesh.polygons:polys.setdefault(root(p.vertices[0]),[]).append(p)
 world=np.array([tuple(obj.matrix_world@v.co) for v in mesh.vertices]);cells=[]
 for ps in polys.values():
  ids=list({i for p in ps for i in p.vertices});pts=world[ids];lo=pts.min(axis=0);hi=pts.max(axis=0)
  if abs(hi[2]-.0065)>.00005 or abs((hi[2]-lo[2])-.025)>.00005 or max(hi[:2]-lo[:2])>1.001:continue
  top=next(p for p in ps if p.normal.z>.999 and all(abs(world[i,2]-.0065)<.00005 for i in p.vertices))
  toppts=world[list(top.vertices)];topuv=np.array([tuple(uv.data[i].uv) for i in top.loop_indices]);affine=np.linalg.lstsq(np.c_[toppts[:,:2],np.ones(len(toppts))],topuv,rcond=None)[0]
  lower=lo[:2]-.002;upper=hi[:2]+.002
  for axis,edge in [(0,6),(1,9)]:
   if abs(lower[axis]+edge)<.0001:lower[axis]=-edge-.125
   if abs(upper[axis]-edge)<.0001:upper[axis]=edge+.125
  # Adjacent room origins are exactly18m apart. Extending the mortar by125mm
  # in the longitudinal direction made two coplanar top surfaces at the doorway.
  lower[1]=max(lower[1],-9.0);upper[1]=min(upper[1],9.0)
  cells.append((lower,upper,toppts[:,:2].min(axis=0)+.035,toppts[:,:2].max(axis=0)-.035,affine))
 material=next(i for i,m in enumerate(mesh.materials) if m.get('surfaceKind')=='mortar')
 old=[p.index for p in mesh.polygons if p.material_index==material and p.normal.z>.999 and p.area>200]
 if not old:return {'alreadyRepaired':True,'cells':len(cells)}
 assert len(old)==1,old
 bm=bmesh.new();bm.from_mesh(mesh);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[i] for i in old],context='FACES_ONLY')
 metric=bm.loops.layers.uv['MetricUV'];light=bm.loops.layers.uv['LightUV'];inverse=obj.matrix_world.inverted()
 for lower,upper,insetlo,insethi,affine in cells:
  pts=[np.array(p) for p in [(lower[0],lower[1]),(upper[0],lower[1]),(upper[0],upper[1]),(lower[0],upper[1])]]
  face=bm.faces.new([bm.verts.new(inverse@Vector((p[0],p[1],.004))) for p in pts]);face.material_index=material
  for loop,p in zip(face.loops,pts):loop[metric].uv=p;loop[light].uv=np.r_[np.clip(p,insetlo,insethi),1]@affine
 bm.normal_update();bm.to_mesh(mesh);bm.free();mesh.update()
 return {'cells':len(cells),'topY':.004,'planeBoundsChanged':True,'moduleLongitudinalBounds':[-9,9],'addedTriangles':2*len(cells)-2,'samples':'adjacent slab exposed radiance; local furniture/tree shadows retained'}
