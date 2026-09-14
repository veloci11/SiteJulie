"""Original potted olive geometry, without pot. Blender 5.x; runtime X/Y-up/Z metres.
Run Blender --background --python scripts/blender/tree_olive.py [-- --render].
External CC0 bark provenance is preserved under assets/museum/trees/source.
"""
import bpy, math, random, json, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/museum/trees';OUT.mkdir(parents=True,exist_ok=True)
TEX=OUT/'textures';TEX.mkdir(exist_ok=True)
PUB=ROOT/'public/museum';ART=ROOT/'artifacts/olive-qa';ART.mkdir(parents=True,exist_ok=True)
rng=random.Random(9217)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def xyz(v):return (v[0],-v[2],v[1])
def image(name,array,noncolor=False):
 h,w,_=array.shape;im=bpy.data.images.new(name,width=w,height=h,alpha=True)
 im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB'
 im.pixels.foreach_set(np.dstack((np.clip(array,0,1),np.ones((h,w)))).astype(np.float32).ravel())
 im.filepath_raw=str(TEX/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
# Olive leaf atlas: upper left, silver lower right. Narrow lanceolate geometry
# defines silhouette, so no alpha cards, alpha sorting or cutout overdraw.
h,w=512,256;v,u=np.mgrid[0:h,0:w];q=(u%(w//2))/(w//2-1);t=v/(h-1)
central=np.exp(-((q-.5)/.017)**2)
veins=np.exp(-(np.sin((t-abs(q-.5)*.28)*math.tau*12)/.065)**2)*(1-central)*.3
noise=np.random.default_rng(43).normal(0,1,(h,w))
upper=np.zeros((h,w,3));upper[:]=(.19,.29,.10)
upper+=(.04*np.sin(t*math.pi)+.009*noise)[...,None]
upper+=central[...,None]*np.array([.085,.095,.04])+veins[...,None]*np.array([.035,.045,.019])
lower=np.zeros_like(upper);lower[:]=(.52,.56,.405);lower+=(.014*noise)[...,None];lower+=central[...,None]*.09+veins[...,None]*.05
mask=(u<w//2)[...,None];leaf=image('olive-leaf-albedo',np.where(mask,upper,lower))
height=.013*central+.004*veins+.0001*noise
dx=np.gradient(height,axis=1)*12;dy=np.gradient(height,axis=0)*12
n=np.dstack((-dx,-dy,np.ones_like(dx)));n/=np.linalg.norm(n,axis=2)[...,None]
leafn=image('olive-leaf-normal',n*.5+.5,True)
def material(name,base=None,normal=None,rough=.8,vertex=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=True
 ns=m.node_tree.nodes;lk=m.node_tree.links;p=ns.get('Principled BSDF');p.inputs['Roughness'].default_value=rough
 if base:
  tex=ns.new('ShaderNodeTexImage');tex.image=base;lk.new(tex.outputs['Color'],p.inputs['Base Color'])
 if vertex:
  vc=ns.new('ShaderNodeVertexColor');vc.layer_name='Tint';mix=ns.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;lk.new(tex.outputs['Color'],mix.inputs[1]);lk.new(vc.outputs['Color'],mix.inputs[2]);lk.new(mix.outputs[0],p.inputs['Base Color'])
 if normal:
  tex=ns.new('ShaderNodeTexImage');tex.image=normal;nm=ns.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.85 if 'Bark' in name else .32;lk.new(tex.outputs['Color'],nm.inputs['Color']);lk.new(nm.outputs['Normal'],p.inputs['Normal'])
 return m
bark=bpy.data.images.load(str(OUT/'source/bark-color.jpg'));bark.pack()
normal=bpy.data.images.load(str(OUT/'source/bark-normal.jpg'));normal.colorspace_settings.name='Non-Color';normal.pack()
BM=material('Olive Bark PBR CC0',bark,normal,.92,True)
rough=bpy.data.images.load(str(OUT/'source/bark-roughness.jpg'));rough.colorspace_settings.name='Non-Color';rough.pack();rt=BM.node_tree.nodes.new('ShaderNodeTexImage');rt.image=rough;BM.node_tree.links.new(rt.outputs['Color'],BM.node_tree.nodes.get('Principled BSDF').inputs['Roughness'])
LM=material('Olive Leaf upper and silver reverse',leaf,leafn,.65,True)
# Buffers are authored in Y-up. Per vertex UVs deliberately duplicate tube seams.
B={'v':[],'f':[],'uv':[],'c':[]};L={'v':[],'f':[],'uv':[],'c':[]};terminal_shoots=[]
def tube(points,radii,sides=7):
 pts=[Vector(p) for p in points];base=len(B['v']);dist=0
 for j,(p,r) in enumerate(zip(pts,radii)):
  tangent=(pts[min(j+1,len(pts)-1)]-pts[max(0,j-1)]).normalized()
  a=tangent.cross(Vector((0,0,1))).normalized();b=tangent.cross(a).normalized()
  if j:dist+=(p-pts[j-1]).length
  for k in range(sides+1):
   ang=k/sides*math.tau;groove=1+.12*math.sin(ang*5+j*.28)+.055*math.sin(ang*9-j*.22)
   co=p+(a*math.cos(ang)+b*math.sin(ang))*r*groove
   B['v'].append(tuple(co));B['uv'].append((k/sides*max(r*math.tau,.015)/.36,dist/.55))
   shade=.79+.13*math.cos(ang*3+j*.7);B['c'].append((shade*.70,shade*.76,shade*.87,1))
  if j:
   off=base+j*(sides+1)
   for k in range(sides):B['f'].append((off+k,off+k+1,off+k+1-(sides+1),off+k-(sides+1)))
 # caps hidden in branch unions, actual outward winding verified below.
 B['f'].append(tuple(base+k for k in reversed(range(sides))))
 top=base+(len(pts)-1)*(sides+1);B['f'].append(tuple(top+k for k in range(sides)))
def bezier(a,b,c,d,steps=7):return [(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d for t in map(float,np.linspace(0,1,steps))]
leaf_count=0
def add_leaf(base,direction,length,width,roll):
 global leaf_count
 leaf_count+=1;d=Vector(direction).normalized();cross=d.cross(Vector((0,1,0))).normalized();up=cross.cross(d).normalized();cross,up=cross*math.cos(roll)+up*math.sin(roll),-cross*math.sin(roll)+up*math.cos(roll)
 base=Vector(base);tint=rng.uniform(.82,1.13);color=(tint*rng.uniform(.94,1.02),tint,tint*rng.uniform(.89,1.10),1)
 # 11 points, 12 triangles per surface: pointed tips, raised midrib, curved blade.
 coords=[];uv=[]
 for t in [0,.25,.5,.75,1]:
  sides=[0] if t in [0,1] else [-1,0,1]
  for s in sides:
   width_here=width*math.sin(math.pi*t)**.75
   p=base+d*(length*t)+up*(math.sin(math.pi*t)*length*.065-length*t*t*.08 + (1-abs(s))*width*.15)+cross*(s*width_here)
   coords.append(p);uv.append((.5+s*.49,t))
 faces=[(0,1,2),(0,2,3),(1,4,5),(1,5,2),(2,5,6),(2,6,3),(4,7,8),(4,8,5),(5,8,9),(5,9,6),(7,10,8),(8,10,9)]
 # Correct winding by geometry rather than relying on a visual double-sided fix.
 if (coords[faces[2][1]]-coords[faces[2][0]]).cross(coords[faces[2][2]]-coords[faces[2][0]]).dot(up)<0:faces=[tuple(reversed(f)) for f in faces]
 for bottom in [False,True]:
  idx=len(L['v'])
  for p,(s,t) in zip(coords,uv):
   L['v'].append(tuple(p-up*.00035 if bottom else p));L['uv'].append(((s*.47+.015)+(.5 if bottom else 0),t*.97+.015));L['c'].append(color)
  for f in faces:L['f'].append(tuple(idx+i for i in reversed(f)) if bottom else tuple(idx+i for i in f))
# An old, slightly twisted potted trunk with a broad irregular root flare.
trunk=[Vector(p) for p in [(0,.87,0),(-.012,.94,.008),(-.047,1.08,.01),(-.045,1.29,-.009),(.01,1.47,-.021),(.048,1.65,.004),(.018,1.85,.047),(.064,2.04,.069),(.10,2.25,.056)]]
tube(trunk,[.091,.079,.066,.057,.053,.044,.037,.023,.004],18)
for i in range(5):
 a=i*math.tau/5+.25;tube([Vector((math.cos(a)*.12,.872,math.sin(a)*.12)),Vector((math.cos(a)*.056,.94,math.sin(a)*.056)),Vector((-.012,1.04,.007))],[.013,.026,.037],9)
# Six unequal boughs carry irregular side shoots. Wider lower branches and an
# open middle produce believable silhouette gaps instead of a spherical blob.
for j in range(7):
 angle=j*2.399+.24;h=1.38+j*.083;reach=rng.uniform(.43,.61)*(1 if j<5 else .73)
 start=Vector((.025,h,.013));end=Vector((math.cos(angle)*reach,h+rng.uniform(.7,.91),math.sin(angle)*reach))
 mid1=start+Vector((math.cos(angle)*reach*.48,.09,math.sin(angle)*reach*.48));mid2=end-Vector((math.cos(angle)*.06,.28,math.sin(angle)*.06))
 path=bezier(start,mid1,mid2,end,9);tube(path,[.029*(1-t)**1.15+.001 for t in np.linspace(0,1,9)],9)
 for k in range(5):
  origin=path[3+k];aa=angle+(-1 if k%2 else 1)*rng.uniform(.58,1.3);reach2=rng.uniform(.14,.23)
  tip=origin+Vector((math.cos(aa)*reach2,rng.uniform(.17,.32),math.sin(aa)*reach2))
  # Keep canopy inside 0.8 m radius including leaves.
  if math.hypot(tip.x,tip.z)>.69:tip.x*=.69/math.hypot(tip.x,tip.z);tip.z*=.69/max(math.hypot(tip.x,tip.z),.69)
  path2=bezier(origin,origin+Vector((0,.06,0)),tip-Vector((0,.08,0)),tip,5);tube(path2,[.009,.007,.0045,.0022,.0007],5)
  for t in [.81,.98]:
   for sign in [-1,1]:
    add_leaf(path2[-2].lerp(path2[-1],t),Vector((math.cos(aa+sign*1.3),.16,math.sin(aa+sign*1.3))),rng.uniform(.058,.083),rng.uniform(.007,.011),rng.uniform(-.9,.9))
  for sh in range(3):
   root=path2[1+sh];az=aa+(-1 if sh else 1)*.9
   shoot_end=root+Vector((math.cos(az)*rng.uniform(.10,.17),rng.uniform(.09,.20),math.sin(az)*rng.uniform(.10,.17)))
   shoot=bezier(root,root+Vector((0,.04,0)),shoot_end-Vector((0,.03,0)),shoot_end,4);tube(shoot,[.0028,.0018,.001,.00035],4)
   terminal_shoots.append((shoot[0].copy(),shoot[-1].copy(),az))
   for node in range(4):
    t=.10+node*.24+rng.uniform(-.04,.04);p=shoot[0].lerp(shoot[-1],t);az2=az+(node%2)*math.pi*.48
    for sign in [-1,1]:
     a=az2+sign*math.pi*.5;direction=Vector((math.cos(a),rng.uniform(-.25,.42),math.sin(a)))
     add_leaf(p,direction,rng.uniform(.055,.082),rng.uniform(.007,.011),rng.uniform(-.75,.75))
# A few terminal leaves complete the trunk leader instead of leaving a spear.
for t in [.78,.89,.98]:
 for sign in [-1,1]:
  add_leaf(trunk[-2].lerp(trunk[-1],t),Vector((sign*.7,.15,sign*.5)),.064,.009,sign*.6)
# Reserve clearance inside the existing 0.8 m planter obstacle proxy.
radius=max(math.hypot(v[0],v[2]) for v in B['v']+L['v'])
authored_scale=min(1,.79/radius)
if radius>.79:
 for data in [B,L]:data['v']=[(v[0]*.79/radius,v[1],v[2]*.79/radius) for v in data['v']]
# Crown revision: append young terminal pairs after the entire previous geometry
# and its radius adjustment are complete. Independent RNG avoids changing any
# existing branch positions, bark UVs or the architecture's baked occluders.
rng=random.Random(98736)
for i,(start,end,az) in enumerate(terminal_shoots):
 start=Vector((start.x*authored_scale,start.y,start.z*authored_scale));end=Vector((end.x*authored_scale,end.y,end.z*authored_scale))
 for node,t in enumerate([.43,.71,.98]):
  if i==len(terminal_shoots)-1 and node==0:continue
  p=start.lerp(end,t)
  for sign in [-1,1]:
   a=az+node*.72+sign*1.14;d=Vector((math.cos(a),rng.uniform(-.16,.42),math.sin(a)))
   if math.hypot(p.x,p.z)>.68:
    d=Vector((-p.x*.65+d.x*.35,d.y,-p.z*.65+d.z*.35))
   first=len(L['v']);add_leaf(p,d,rng.uniform(.057,.081),rng.uniform(.0075,.011),rng.uniform(-1.05,1.05))
   # Only newly added leaves may receive a local boundary clamp, never wood or
   # the already baked silhouette. All leaves remain within the same obstacle.
   for idx in range(first,len(L['v'])):
    x,y,z=L['v'][idx];r=math.hypot(x,z)
    if r>.797:L['v'][idx]=(x*.797/r,y,z*.797/r)
# Check radius before producing public output.
assert max(math.hypot(v[0],v[2]) for v in B['v']+L['v'])<.8

def mesh(name,data,mat):
 me=bpy.data.meshes.new(name);me.from_pydata([xyz(p) for p in data['v']],[],data['f']);me.update()
 obj=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(obj);me.materials.append(mat)
 uv=me.uv_layers.new(name='UVMap');co=me.color_attributes.new(name='Tint',type='FLOAT_COLOR',domain='POINT')
 for i,c in enumerate(data['c']):co.data[i].color=c
 for poly in me.polygons:
  poly.use_smooth=True
  for loop in poly.loop_indices:uv.data[loop].uv=data['uv'][me.loops[loop].vertex_index]
 return obj
wood=mesh('Olive trunk boughs and fine shoots',B,BM);leaves=mesh('Olive lanceolate curved leaves',L,LM)
# Tube face winding must face outward. Current longitudinal surface winding is
# checked analytically through normals at first ring; reverse whole wood if needed.
# Recalculate outward on closed branches, leaves retain authored paired normals.
import bmesh
bm=bmesh.new();bm.from_mesh(wood.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(wood.data);bm.free()
for o in [wood,leaves]:o['assetRole']='olive-tree';o['rootY']=.87;o['unbakedPBR']=True
bpy.context.scene.world.color=(.3,.3,.3)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'olive-source.blend'))
bpy.ops.export_scene.gltf(filepath=str(PUB/'olive-detailed.glb'),export_format='GLB',export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=83,export_vertex_color='NAME',export_vertex_color_name='Tint',export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=18,export_draco_normal_quantization=12,export_draco_texcoord_quantization=14)
report={'generator':'scripts/blender/tree_olive.py','blender':bpy.app.version_string,'rootY':.87,'radiusMax':max(math.hypot(v[0],v[2]) for v in B['v']+L['v']),'leafCount':leaf_count,'leafLengthMetres':[.055,.083],'triangles':sum(len(f)-2 for f in B['f']+L['f']),'meshBatches':2,'crownRevision':2,'addedTerminalLeaves':628,'woodUnchangedFromPrior':True,'bounds':{'min':np.min(B['v']+L['v'],axis=0).tolist(),'max':np.max(B['v']+L['v'],axis=0).tolist()},'bytes':(PUB/'olive-detailed.glb').stat().st_size}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n');print('OLIVE_REPORT '+json.dumps(report))
if '--render' in sys.argv:
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
 scene.render.resolution_x=1000;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
 scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.55,.61,.7,1);scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.45
 floorMat=bpy.data.materials.new('QA neutral stand');floorMat.diffuse_color=(.22,.20,.17,1)
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.5,depth=.87,location=xyz((0,.435,0)));bpy.context.object.data.materials.append(floorMat)
 bpy.ops.mesh.primitive_plane_add(size=200,location=xyz((0,0,0)));bpy.context.object.data.materials.append(floorMat)
 for pos,power,size in [((3,5,4),600,4),((-3,3,-1),350,3)]:
  bpy.ops.object.light_add(type='AREA',location=xyz(pos));light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector(xyz((0,1.6,0)))-light.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=xyz((3.1,2.8,4.6)));camera=bpy.context.object;camera.rotation_euler=(Vector(xyz((0,1.65,0)))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=3.5;scene.camera=camera
 scene.render.filepath=str(ART/'olive-composition.png');bpy.ops.render.render(write_still=True)
 camera.location=xyz((1.25,2.10,1.35));camera.rotation_euler=(Vector(xyz((.12,1.94,.06)))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=1.05;scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.filepath=str(ART/'olive-detail.png');bpy.ops.render.render(write_still=True)
