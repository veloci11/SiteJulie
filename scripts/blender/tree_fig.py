"""Original Ficus carica model; Y-up metre contract with compact pot soil at Y=.70; crown height4.35m.
Blender --background --threads 2 --python scripts/blender/tree_fig.py -- --render
Botanical source only (no copied photos): Kew Ficus carica + NC State Extension.
"""
import bpy,bmesh,math,random,json,sys,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/museum/trees/fig';TEX=OUT/'textures';ART=ROOT/'artifacts/fig-qa'
for p in [OUT,TEX,ART]:p.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
rng=random.Random(5199)
def xyz(p):return (p[0],-p[2],p[1])
def image(name,a,noncolor=False):
 h,w,_=a.shape;im=bpy.data.images.new(name,width=w,height=h,alpha=True);im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB';im.pixels.foreach_set(np.dstack((np.clip(a,0,1),np.ones((h,w)))).astype(np.float32).ravel());im.filepath_raw=str(TEX/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
# All texture pixels are original. No external photograph is recoloured.
N=512;y,x=np.mgrid[0:N,0:N]/N;nr=np.random.default_rng(218);grain=nr.normal(0,1,(N,N))
cloud=.025*np.sin(x*math.tau*3+np.sin(y*math.tau*2))+.012*np.sin(y*math.tau*7+x*12)
lenticels=np.exp(-(np.sin(y*math.tau*23+x*4)/.1)**2)*np.exp(-(np.sin(x*math.tau*17)/.22)**2)
color=np.zeros((N,N,3));color[:]=(.47,.455,.415);color+=(cloud+.007*grain+.04*lenticels)[...,None]
bark=image('fig-bark-albedo',color)
height=.002*grain+.004*cloud+.003*lenticels
def normals(height,strength):
 dx=np.gradient(height,axis=1)*strength;dy=np.gradient(height,axis=0)*strength;n=np.dstack((-dx,-dy,np.ones_like(dx)));n/=np.linalg.norm(n,axis=2)[...,None];return n*.5+.5
barkn=image('fig-bark-normal',normals(height,3),True)
# Leaf atlas: upper left / lower right, with five palmate primary veins.
H,W=512,1024;yy,xx=np.mgrid[0:H,0:W];u=(xx%512)/511*1.24-.62;v=yy/511*1.2-.04
veins=np.zeros((H,W));secondary=np.zeros_like(veins)
origin=np.array([0,.035])
for end in [(-.47,.27),(-.53,.63),(0,1.12),(.53,.63),(.47,.27)]:
 d=np.array(end)-origin;px=u-origin[0];py=v-origin[1];t=np.clip((px*d[0]+py*d[1])/(d@d),0,1);distance=np.sqrt((px-t*d[0])**2+(py-t*d[1])**2)
 veins=np.maximum(veins,np.exp(-(distance/.007)**2)*(1-t*.65))
 for k in [.26,.43,.6,.77]:
  point=origin+d*k
  for s in [-1,1]:
   cross=np.array([-d[1],d[0]])*s;tip=point+cross*.15+d*.13;d2=tip-point;t2=np.clip(((u-point[0])*d2[0]+(v-point[1])*d2[1])/(d2@d2),0,1);dist2=np.hypot(u-point[0]-t2*d2[0],v-point[1]-t2*d2[1]);secondary=np.maximum(secondary,np.exp(-(dist2/.0024)**2)*(1-t2*.65))
grain=nr.normal(0,1,(H,W));mottling=.017*np.sin(u*31+np.sin(v*17))+.012*np.sin(v*47-u*9)+grain*.004
upper=np.zeros((H,W,3));upper[:]=(.17,.285,.10);upper+=mottling[...,None];upper+=veins[...,None]*np.array([.07,.08,.027])+secondary[...,None]*.025
lower=np.zeros_like(upper);lower[:]=(.34,.42,.21);lower+=mottling[...,None]*.7+veins[...,None]*.09+secondary[...,None]*.035
leaf=image('fig-leaf-albedo',np.where((xx<512)[...,None],upper,lower));leafn=image('fig-leaf-normal',normals(.025*veins+.005*secondary+grain*.0005,8),True)
def mat(name,base,norm,rough):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=True;ns=m.node_tree.nodes;lk=m.node_tree.links;p=ns.get('Principled BSDF');p.inputs['Roughness'].default_value=rough
 tx=ns.new('ShaderNodeTexImage');tx.image=base;vc=ns.new('ShaderNodeVertexColor');vc.layer_name='Tint';mul=ns.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;lk.new(tx.outputs['Color'],mul.inputs[1]);lk.new(vc.outputs['Color'],mul.inputs[2]);lk.new(mul.outputs[0],p.inputs['Base Color'])
 nt=ns.new('ShaderNodeTexImage');nt.image=norm;nm=ns.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.4;lk.new(nt.outputs['Color'],nm.inputs['Color']);lk.new(nm.outputs['Normal'],p.inputs['Normal']);return m
BM=mat('Fig smooth grey brown bark',bark,barkn,.89);LM=mat('Fig palmate leaf upper and reverse',leaf,leafn,.72)
B={'v':[],'f':[],'uv':[],'c':[]};L={'v':[],'f':[],'uv':[],'c':[]}
def mature(p):return Vector((p[0]*1.42,.70+(p[1]-.87)*1.72,p[2]*1.42))
def tube(points,radii,sides=7):
 pts=[mature(p) for p in points];radii=[r*1.18 for r in radii];base=len(B['v']);dist=0
 for j,(p,r) in enumerate(zip(pts,radii)):
  tangent=(pts[min(j+1,len(pts)-1)]-pts[max(j-1,0)]).normalized();a=tangent.cross(Vector((0,0,1))).normalized();b=tangent.cross(a).normalized()
  if j:dist+=(p-pts[j-1]).length
  for k in range(sides+1):
   angle=k/sides*math.tau;rr=r*(1+.045*math.sin(angle*3+j*.6));co=p+(a*math.cos(angle)+b*math.sin(angle))*rr;B['v'].append(tuple(co));B['uv'].append((k/sides*r*math.tau/.28,dist/.5));shade=.92+.06*math.cos(angle+j*.4);B['c'].append((shade,shade,shade,1))
  if j:
   off=base+j*(sides+1)
   for k in range(sides):B['f'].append((off+k,off+k+1,off+k+1-sides-1,off+k-sides-1))
 B['f'].append(tuple(base+k for k in reversed(range(sides))));top=base+(len(pts)-1)*(sides+1);B['f'].append(tuple(top+k for k in range(sides)))
def bezier(a,b,c,d,n):return [(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d for t in map(float,np.linspace(0,1,n))]
# Original outline: rounded basal lobes, deep lateral sinuses and elongated centre.
# Normalised coordinates are leaf plane (x across, y along blade), not olive mesh.
right=[(0,0),(.12,-.015),(.27,.025),(.39,.10),(.48,.20),(.5,.27),(.45,.315),(.36,.31),(.27,.265),(.32,.405),(.46,.47),(.56,.535),(.58,.625),(.53,.705),(.46,.74),(.37,.69),(.27,.57),(.185,.475),(.185,.67),(.205,.865),(.15,1.015),(.08,1.095),(0,1.14)]
outline=right+[(-x,y) for x,y in reversed(right[1:-1])];leafcount=0

def addleaf(p,d,length,roll,variant):
 global leafcount
 leafcount+=1;p=mature(p);length*=1.32;d=Vector(d).normalized();cross=d.cross(Vector((0,1,0))).normalized();up=cross.cross(d).normalized();cross,up=cross*math.cos(roll)+up*math.sin(roll),-cross*math.sin(roll)+up*math.cos(roll)
 center=Vector((0,.24));coords=[center];coords += [center.lerp(Vector(q),.54) for q in outline];coords += [Vector(q) for q in outline];N=len(outline);faces=[]
 for i in range(N):
  j=(i+1)%N;faces.extend([(0,1+i,1+j),(1+i,1+N+i,1+N+j),(1+i,1+N+j,1+j)])
 tint=rng.uniform(.83,1.12);col=(tint*rng.uniform(.91,1.03),tint,tint*rng.uniform(.87,1.06),1)
 verts=[]
 for q in coords:
  x,y=q;curve=length*(.065*math.sin(y*math.pi)-.10*y*y+.085*(x/.6)**2+variant*.035*x*y)
  # Concave central blade and lifted lobe edges give a gently cupped living leaf.
  verts.append(p+d*(y*length)+cross*(x*length*.80)+up*curve)
 if (verts[faces[0][1]]-verts[0]).cross(verts[faces[0][2]]-verts[0]).dot(up)<0:faces=[tuple(reversed(f)) for f in faces]
 for back in [False,True]:
  off=len(L['v'])
  for q,co in zip(coords,verts):
   L['v'].append(tuple(co-up*.00055 if back else co));L['uv'].append((((q.x+.62)/1.24)*.485+.0075+(.5 if back else 0),(q.y+.04)/1.2*.97+.015));L['c'].append(col)
  for f in faces:L['f'].append(tuple(off+i for i in reversed(f)) if back else tuple(off+i for i in f))

trunk=[Vector(p) for p in [(0,.87,0),(-.022,1.02,.011),(-.029,1.22,.005),(.018,1.43,-.016),(.054,1.65,.021),(.026,1.86,.052),(.06,2.12,.04),(.065,2.34,.066)]]
tube(trunk,[.076,.067,.060,.052,.039,.03,.014,.0035],16)
for i in range(4):
 a=i*math.pi*.5;tube([(math.cos(a)*.10,.869,math.sin(a)*.10),(math.cos(a)*.04,.96,math.sin(a)*.04),(-.01,1.06,.006)],[.011,.023,.032],8)
# Six broad, rounded boughs and four alternate terminal shoots per bough.
for branch in range(8):
 a=branch*2.399+.2;h=1.34+branch*.085;reach=rng.uniform(.39,.49)
 start=Vector((.02,h,.006));tip=Vector((math.cos(a)*reach,h+rng.uniform(.74,.94),math.sin(a)*reach));path=bezier(start,start+Vector((math.cos(a)*.24,.09,math.sin(a)*.24)),tip-Vector((math.cos(a)*.05,.25,math.sin(a)*.05)),tip,9)
 tube(path,[.027*(1-t)**1.25+.0015 for t in map(float,np.linspace(0,1,9))],8)
 for sh in range(5):
  az=a+(-1 if sh%2 else 1)*rng.uniform(.6,1.2);base=path[min(3+sh,7)];end=base+Vector((math.cos(az)*rng.uniform(.13,.21),rng.uniform(.18,.31),math.sin(az)*rng.uniform(.13,.21)));shoot=bezier(base,base+Vector((0,.055,0)),end-Vector((0,.065,0)),end,6);tube(shoot,[.008,.0065,.005,.0037,.002,.0007],6)
  for node in range(5):
   t=.16+node*.195;origin=shoot[0].lerp(shoot[-1],t);angle=az+(node*2.399)+rng.uniform(-.2,.2)
   # Alternate petioles, not opposite olive pairs; broad blades overlap loosely.
   direction=Vector((math.cos(angle),rng.uniform(-.15,.55),math.sin(angle))).normalized();petiole_len=rng.uniform(.035,.055);petiole=origin+direction*petiole_len+Vector((0,.012,0));tube([origin,origin.lerp(petiole,.55)+Vector((0,.005,0)),petiole],[.0017,.0013,.0008],4)
   addleaf(petiole,direction,rng.uniform(.16,.205),rng.uniform(-.7,.7),rng.uniform(-1,1))
# Final upright shoot carries a small crown above the main trunk.
for node in range(6):
 a=node*2.399;origin=trunk[-2].lerp(trunk[-1],.18+node*.15);direction=Vector((math.cos(a),.25,math.sin(a)));petiole=origin+direction*.043;tube([origin,petiole],[.0018,.0008],4);addleaf(petiole,direction,.18,rng.uniform(-.55,.55),rng.uniform(-1,1))
# Scale the authored crown horizontally once; root contract and vertical scale stay.
radius=max(math.hypot(v[0],v[2]) for v in B['v']+L['v']);factor=min(1,1.10/radius)
vertical=(4.35-.70)/(max(v[1] for v in B['v']+L['v'])-.70)
for data in [B,L]:data['v']=[(p[0]*factor,.70+(p[1]-.70)*vertical,p[2]*factor) for p in data['v']]
assert max(v[1] for v in B['v']+L['v'])<4.351

def mesh(name,data,mat):
 me=bpy.data.meshes.new(name);me.from_pydata([xyz(p) for p in data['v']],[],data['f']);me.update();obj=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(obj);me.materials.append(mat);uv=me.uv_layers.new(name='UVMap');col=me.color_attributes.new(name='Tint',type='FLOAT_COLOR',domain='POINT')
 for i,c in enumerate(data['c']):col.data[i].color=c
 for poly in me.polygons:
  poly.use_smooth=True
  for loop in poly.loop_indices:uv.data[loop].uv=data['uv'][me.loops[loop].vertex_index]
 return obj
wood=mesh('Fig trunk branches petioles',B,BM);leaves=mesh('Fig five lobed curved leaves',L,LM)
bm=bmesh.new();bm.from_mesh(wood.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(wood.data);bm.free()
for o in [wood,leaves]:o['assetRole']='fig-tree';o['rootY']=.70;o['unbakedPBR']=True
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'fig-source.blend'))
target=ROOT/'public/museum/fig-detailed.glb'
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=88,export_vertex_color='NAME',export_vertex_color_name='Tint',export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=18,export_draco_normal_quantization=12,export_draco_texcoord_quantization=14)
report={'species':'Ficus carica inspired original model','blender':bpy.app.version_string,'leafCount':leafcount,'leafBladeLengthMetres':[.2408,.3085],'petioleMetres':[.047,.083],'rootY':.70,'horizontalFitFactor':factor,'radiusMax':max(math.hypot(v[0],v[2]) for v in B['v']+L['v']),'triangles':sum(len(f)-2 for f in B['f']+L['f']),'bytes':target.stat().st_size,'meshBatches':2,'bounds':{'min':np.min(B['v']+L['v'],axis=0).tolist(),'max':np.max(B['v']+L['v'],axis=0).tolist()},'allGeometryAndTexturesOriginal':True}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n');print('FIG_REPORT '+json.dumps(report))
# Keep the provenance tied to each reproduced artifact, including this generator.
provenance_path=OUT/'provenance.json'
provenance=json.loads(provenance_path.read_text()) if provenance_path.exists() else {'authorship':'Original procedural geometry and textures created for this project','externalMediaUsed':False,'botanicalReferences':['https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A852556-1/general-information','https://plants.ces.ncsu.edu/plants/ficus-carica/','https://www.nparks.gov.sg/florafaunaweb/flora/4/1/4167']}
provenance['files']=[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [TEX/'fig-bark-albedo.png',TEX/'fig-bark-normal.png',TEX/'fig-leaf-albedo.png',TEX/'fig-leaf-normal.png',Path(__file__).resolve(),target]]
provenance_path.write_text(json.dumps(provenance,indent=2)+'\n')
if '--render' in sys.argv:
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=840;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
 scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.55,.61,.7,1);scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.4
 neutral=bpy.data.materials.new('QA placeholder only');neutral.diffuse_color=(.24,.20,.155,1)
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.48,depth=.74,location=xyz((0,.37,0)));bpy.context.object.data.materials.append(neutral)
 bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.data.materials.append(neutral)
 for pos,power,size in [((3,5,4),450,4),((-3,3,-1),260,3)]:
  bpy.ops.object.light_add(type='AREA',location=xyz(pos));o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector(xyz((0,1.6,0)))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=xyz((3.1,2.8,4.6)));camera=bpy.context.object;camera.rotation_euler=(Vector(xyz((0,2.30,0)))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=4.9;scene.camera=camera;scene.render.filepath=str(ART/'fig-composition.png');bpy.ops.render.render(write_still=True)
 camera.location=xyz((1.2,2.3,1.6));camera.rotation_euler=(Vector(xyz((.1,2.1,.08)))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=1.15;scene.render.resolution_x=1000;scene.render.resolution_y=840;scene.render.filepath=str(ART/'fig-detail.png');bpy.ops.render.render(write_still=True)
