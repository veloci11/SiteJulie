"""Original Ficus carica model; Y-up metre contract with compact pot soil at Y=.70; crown height4.35m.
Blender --background --threads 2 --python scripts/blender/tree_fig_variants.py -- reading --render
Botanical source only (no copied photos): Kew Ficus carica + NC State Extension.
"""
import bpy,bmesh,math,random,json,sys,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
ROOT=Path(__file__).resolve().parents[2]
VARIANT=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv and sys.argv[sys.argv.index('--')+1] in ['reading','central'] else 'central'
READING=VARIANT=='reading'
OUT=ROOT/'assets/museum/trees'/('fig-'+VARIANT);TEX=OUT/'textures';ART=ROOT/'artifacts/fig-qa'
for p in [OUT,TEX,ART]:p.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
rng=random.Random(7413 if READING else 19237)
def xyz(p):return (p[0],-p[2],p[1])
def image(name,a,noncolor=False):
 h,w,_=a.shape;im=bpy.data.images.new(name,width=w,height=h,alpha=True);im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB';im.pixels.foreach_set(np.dstack((np.clip(a,0,1),np.ones((h,w)))).astype(np.float32).ravel());im.filepath_raw=str(TEX/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
# All texture pixels are original, generated from metric skin/vein height fields.
# Smooth fig bark: shallow wrinkles/lenticels rather than deep oak-like furrows.
N=512;y,x=np.mgrid[0:N,0:N]/N;nr=np.random.default_rng(218);grain=nr.normal(0,1,(N,N))
cloud=.024*np.sin(x*math.tau*3+np.sin(y*math.tau*2))+.012*np.sin(y*math.tau*7+x*12)
lenticels=np.zeros((N,N));skinrng=np.random.default_rng(821)
for _ in range(180):
 cx,cy=skinrng.random(2);rx=skinrng.uniform(.003,.015);ry=skinrng.uniform(.001,.0035)
 dx=np.minimum(abs(x-cx),1-abs(x-cx));dy=np.minimum(abs(y-cy),1-abs(y-cy))
 lenticels=np.maximum(lenticels,np.exp(-(dx/rx)**2-(dy/ry)**2))
folds=np.sin(x*math.tau*31+1.6*np.sin(y*math.tau*5+np.sin(x*math.tau*2))+.8*np.sin(y*math.tau*19))*.5+.5
pores=np.exp(-(np.sin(x*math.tau*57+y*17)/.12)**2)*np.exp(-(np.sin(y*math.tau*83+x*5)/.18)**2)
color=np.zeros((N,N,3));color[:]=(.355,.331,.286);color+=(cloud+.008*grain+.020*lenticels-.002*folds-.012*pores)[...,None]
bark=image('fig-bark-albedo',color)
height=.00011*grain+.000025*folds+.00045*lenticels-.00025*pores
# Central differences in texture metres; tangent-space RGB stays non-color.
def normals(height,strength):
 dx=np.gradient(height,axis=1)*strength;dy=np.gradient(height,axis=0)*strength;n=np.dstack((-dx,-dy,np.ones_like(dx)));n/=np.linalg.norm(n,axis=2)[...,None];return n*.5+.5
barkn=image('fig-bark-normal',normals(height,512/.28),True)
# Three original atlas regions: broad five lobes / incised five lobes / young three lobes.
# Fine subordinate venation follows each morphology, without a bright painted star.
H,W=512,1024;yy,xx=np.mgrid[0:H,0:W];tile=np.minimum(2,(xx*3)//W);u=(xx*3/W-tile)*1.30-.65;v=yy/511*1.24-.05
veins=np.zeros((H,W));secondary=np.zeros_like(veins);tertiary=np.zeros_like(veins)
origin=np.array([0,.035])
for shape in range(3):
 ends=[(-.45,.27),(-.54,.65),(0,1.12),(.54,.65),(.45,.27)] if shape!=2 else [(-.49,.56),(0,1.10),(.49,.56)]
 for end in ends:
  d=np.array(end)-origin;px=u-origin[0];py=v-origin[1];t=np.clip((px*d[0]+py*d[1])/(d@d),0,1);distance=np.sqrt((px-t*d[0])**2+(py-t*d[1])**2)
  primary=np.exp(-(distance/(.0048*(1-t*.7)+.001))**2)*(1-t*.7)*(tile==shape)
  veins=np.maximum(veins,primary)
  for k in [.22,.34,.46,.58,.70,.82]:
   point=origin+d*k
   for side in [-1,1]:
    cross=np.array([-d[1],d[0]])*side;tip=point+cross*(.09+.035*np.sin(k*math.pi))+d*.12;d2=tip-point;t2=np.clip(((u-point[0])*d2[0]+(v-point[1])*d2[1])/(d2@d2),0,1);dist2=np.hypot(u-point[0]-t2*d2[0],v-point[1]-t2*d2[1]);secondary=np.maximum(secondary,np.exp(-(dist2/.0015)**2)*(1-t2*.65)*(tile==shape))
# Low-contrast mesophyll and tertiary cells give detail at leaf-scale, not camouflage.
grain=nr.normal(0,1,(H,W));mottling=.006*np.sin(u*31+np.sin(v*17))+.004*np.sin(v*47-u*9)+grain*.002
cells=(np.sin(u*347+np.sin(v*83))*np.sin(v*431+u*19))
color=np.zeros((H,W,3));color[:]=(.205,.325,.102);color+=mottling[...,None]+cells[...,None]*.0015
color+=veins[...,None]*np.array([.035,.055,.018])+secondary[...,None]*.012
color+=(tile==2)[...,None]*np.array([.033,.027,.009])
leaf=image('fig-leaf-albedo',color)
leafn=image('fig-leaf-normal',normals(.00020*veins+.000045*secondary+grain*.000006+cells*.000004,512/.28),True)
def mat(name,base,norm,rough):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=True;ns=m.node_tree.nodes;lk=m.node_tree.links;p=ns.get('Principled BSDF');p.inputs['Roughness'].default_value=rough
 tx=ns.new('ShaderNodeTexImage');tx.image=base;vc=ns.new('ShaderNodeVertexColor');vc.layer_name='Tint';mul=ns.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;lk.new(tx.outputs['Color'],mul.inputs[1]);lk.new(vc.outputs['Color'],mul.inputs[2]);lk.new(mul.outputs[0],p.inputs['Base Color'])
 nt=ns.new('ShaderNodeTexImage');nt.image=norm;nm=ns.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.65 if 'bark' in name else .45;lk.new(nt.outputs['Color'],nm.inputs['Color']);lk.new(nm.outputs['Normal'],p.inputs['Normal']);return m
BM=mat('Fig silver grey bark microrelief',bark,barkn,.84);LM=mat('Fig mature curved lamina',leaf,leafn,.73);YM=mat('Fig young curved lamina',leaf,leafn,.68)
for material in [LM,YM]:
 material.use_backface_culling=False
 bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Specular IOR Level'].default_value=.28
 # Small diffuse fill approximation, no transmission/refraction render pass.
 bsdf.inputs['Emission Color'].default_value=(.018,.028,.006,1);bsdf.inputs['Emission Strength'].default_value=.06
 material['leafShading']='opaque double-sided curved lamina; subtle diffuse fill, no screen-space transmission'

C={'v':[],'f':[],'uv':[],'c':[]};B={'v':[],'f':[],'uv':[],'c':[]};L={'v':[],'f':[],'uv':[],'c':[]};Y={'v':[],'f':[],'uv':[],'c':[]}
def mature(p):
 # Distinct habit: reading fig forks lower and spreads; central fig rises upright.
 h=p[1]-.87;return Vector((p[0]*(1.62 if READING else 1.40)+(.06*h if READING else -.025*h),.70+h*(1.58 if READING else 1.76),p[2]*(1.42 if READING else 1.45)))
def tube(points,radii,sides=7,data=None):
 data=B if data is None else data
 pts=[mature(p) for p in points];radii=[r*1.18 for r in radii];base=len(data['v']);dist=0
 for j,(p,r) in enumerate(zip(pts,radii)):
  tangent=(pts[min(j+1,len(pts)-1)]-pts[max(j-1,0)]).normalized();a=tangent.cross(Vector((0,0,1))).normalized();b=tangent.cross(a).normalized()
  if j:dist+=(p-pts[j-1]).length
  for k in range(sides+1):
   angle=k/sides*math.tau;rr=r*(1+.065*math.sin(angle*3+j*.45)+.025*math.sin(angle*7+j*.7));co=p+(a*math.cos(angle)+b*math.sin(angle))*rr;data['v'].append(tuple(co));data['uv'].append((k/sides*r*math.tau/.28,dist/.5));shade=.92+.06*math.cos(angle+j*.4);data['c'].append((shade,shade,shade,1))
  if j:
   off=base+j*(sides+1)
   for k in range(sides):data['f'].append((off+k,off+k+1,off+k+1-sides-1,off+k-sides-1))
 data['f'].append(tuple(base+k for k in reversed(range(sides))));top=base+(len(pts)-1)*(sides+1);data['f'].append(tuple(top+k for k in range(sides)))
def bezier(a,b,c,d,n):return [(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d for t in map(float,np.linspace(0,1,n))]
# Anatomical morphologies, each smoothed geometrically with a Catmull-Rom contour.
# Crenations are small rounded edge relief, not alpha cutouts or giant teeth.
right=[(0,0),(.12,-.015),(.27,.025),(.39,.10),(.48,.20),(.5,.27),(.45,.315),(.36,.31),(.31,.30),(.32,.405),(.46,.47),(.56,.535),(.58,.625),(.53,.705),(.46,.74),(.37,.69),(.315,.59),(.255,.49),(.265,.70),(.24,.90),(.17,1.015),(.08,1.095),(0,1.14)]
three=[(0,0),(.10,-.005),(.19,.02),(.26,.08),(.30,.16),(.32,.25),(.38,.32),(.46,.40),(.51,.50),(.51,.59),(.47,.65),(.41,.67),(.34,.63),(.28,.53),(.23,.48),(.235,.63),(.22,.77),(.19,.89),(.14,1.00),(.09,1.075),(.055,1.10),(.02,1.13),(0,1.14)]
leafcount=0;morphology_counts=[0,0,0]
def smooth_outline(points):
 contour=points+[(-x,y) for x,y in reversed(points[1:-1])];result=[];n=len(contour)
 for i in range(n):
  a,b,c,d=[Vector(contour[(i+j)%n]) for j in [-1,0,1,2]]
  for t in [0,.5]:
   q=.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
   result.append(q)
 return result
outlines=[]
for shape in range(3):
 pts=three if shape==2 else right
 if shape==1:pts=[(x*(.83 if 6<=i<=9 or 15<=i<=18 else 1),y) for i,(x,y) in enumerate(pts)]
 outlines.append(smooth_outline(pts))

# Constrained Delaunay triangulation respects the deep concave sinuses.
# The old radial fan could cross a sinus and reverse local triangle winding.
def inside(q, polygon):
 hit=False;x,y=q
 for a,b in zip(polygon,polygon[1:]+polygon[:1]):
  if (a.y>y)!=(b.y>y) and x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x:hit=not hit
 return hit
templates=[]
for shape,contour in enumerate(outlines):
 border=[Vector((q.x*(1+.005*math.sin(i*math.tau/4)),q.y)) for i,q in enumerate(contour)]
 points=border[:];sample=random.Random(451+shape)
 # 89 interior samples + 88 boundary vertices gives exactly 264 triangles per blade.
 while len(points)<len(border)+89:
  q=Vector((sample.uniform(-.59,.59),sample.uniform(.01,1.12)))
  if inside(q,border) and all((q-p).length>.022 for p in points):points.append(q)
 vertices,edges,faces,*_=delaunay_2d_cdt(points,[],[list(range(len(border)))],1,1e-7,False)
 assert all(len(f)==3 for f in faces)
 templates.append((vertices,faces))

def addleaf(p,d,length,roll,variant):
 global leafcount
 leafcount+=1
 shape=2 if rng.random()<.19 else (0 if rng.random()<.57 else 1);morphology_counts[shape]+=1
 data=Y if shape==2 else L
 p=mature(p);length*=(1.32 if READING else 1.24)*(.73 if shape==2 else 1)
 d=Vector(d).normalized();cross=d.cross(Vector((0,1,0))).normalized();up=cross.cross(d).normalized();cross,up=cross*math.cos(roll)+up*math.sin(roll),-cross*math.sin(roll)+up*math.cos(roll)
 phase=rng.uniform(0,math.tau);asymmetry=rng.uniform(-.065,.065)
 coords=[]
 for q in templates[shape][0]:
  x,y=q;coords.append(Vector((x*(1+.09*variant)*(1+asymmetry*(1 if x>0 else -1)),y+variant*.018*math.sin(y*math.pi*2))))
 faces=templates[shape][1]
 areas=[(coords[b].x-coords[a].x)*(coords[c].y-coords[a].y)-(coords[b].y-coords[a].y)*(coords[c].x-coords[a].x) for a,b,c in faces]
 if min(areas)<-1e-8 and max(areas)>1e-8:raise RuntimeError('Lamina triangle winding changed after variation')
 center=Vector((0,.24))
 tint=rng.uniform(.86,1.08);col=(tint*rng.uniform(.94,1.02),tint,tint*rng.uniform(.93,1.04),1)
 off=len(data['v']);verts=[]
 for q in coords:
  x,y=q;distance=(q-center).length
  # A central crease, drooping tip and locally twisting lobes make a genuinely nonplanar blade.
  curve=length*(.09*math.sin(y*math.pi)-.15*y*y+.065*(x/.6)**2+variant*.055*x*y+.014*math.sin(x*9+y*5+phase)*distance)
  co=p+d*(y*length)+cross*(x*length*.84)+up*curve;verts.append(co)
  data['v'].append(tuple(co));data['uv'].append(((shape+.025+((q.x+.65)/1.30)*.95)/3,(q.y+.05)/1.24*.97+.015))
  shade=1-.035*max(0,1-abs(x)/.16);data['c'].append((col[0]*shade,col[1]*shade,col[2]*shade,1))
 if (verts[faces[0][1]]-verts[faces[0][0]]).cross(verts[faces[0][2]]-verts[faces[0][0]]).dot(up)<0:faces=[tuple(reversed(f)) for f in faces]
 data['f'].extend([tuple(off+i for i in f) for f in faces])

trunk=[Vector(p) for p in ([(0,.87,0),(-.035,1.02,.025),(-.095,1.22,.035),(-.14,1.43,.012),(-.13,1.65,-.025),(-.085,1.86,-.04),(-.01,2.12,.01),(.06,2.40,.08)] if READING else [(0,.87,0),(.02,1.02,-.025),(.045,1.22,-.055),(.085,1.43,-.025),(.06,1.65,.025),(.015,1.86,.075),(-.03,2.12,.10),(-.04,2.43,.11)])]
trunk_radii=[.076,.067,.060,.052,.039,.03,.014,.0035]
tube(trunk,trunk_radii,24,C)
for i in range(4):
 a=i*math.pi*.5;tube([(math.cos(a)*.10,.869,math.sin(a)*.10),(math.cos(a)*.04,.96,math.sin(a)*.04),(-.01,1.06,.006)],[.011,.023,.032],8,C)
# Six broad, rounded boughs and four alternate terminal shoots per bough.
for branch in range(9 if READING else 8):
 a=branch*(2.23 if READING else 2.47)+(.8 if READING else -.3);h=(1.19+branch*.11) if READING else (1.40+branch*.085);reach=rng.uniform(.36,.50) if READING else rng.uniform(.32,.47)
 # Every bough originates on the actual curved trunk centreline at its own height.
 lo,hi=next((lo,hi) for lo,hi in zip(trunk,trunk[1:]) if lo.y<=h<=hi.y)
 start=lo.lerp(hi,(h-lo.y)/(hi.y-lo.y));tip=Vector((math.cos(a)*reach,h+rng.uniform(.74,.94),math.sin(a)*reach));path=bezier(start,start+Vector((math.cos(a)*.24,.09,math.sin(a)*.24)),tip-Vector((math.cos(a)*.05,.25,math.sin(a)*.05)),tip,9)
 parent_index=next(i for i,(lo,hi) in enumerate(zip(trunk,trunk[1:])) if lo.y<=h<=hi.y)
 parent_t=(h-trunk[parent_index].y)/(trunk[parent_index+1].y-trunk[parent_index].y)
 parent_radius=trunk_radii[parent_index]*(1-parent_t)+trunk_radii[parent_index+1]*parent_t
 branch_radius=parent_radius*.66
 # The root cap stays inside its parent; smooth taper avoids a cut cylinder glued onto it.
 main_radii=[branch_radius*(.17+.83*(1-t)**1.15) for t in map(float,np.linspace(0,1,9))]
 tube(path,main_radii,12,C)
 for sh in range(4 if READING else 5):
  az=a+(-1 if sh%2 else 1)*rng.uniform(.6,1.2);base=path[min(3+sh,7)];end=base+Vector((math.cos(az)*rng.uniform(.13,.21),rng.uniform(.18,.31),math.sin(az)*rng.uniform(.13,.21)));shoot=bezier(base,base+Vector((0,.055,0)),end-Vector((0,.065,0)),end,6);shoot_radius=main_radii[min(3+sh,7)]*.65;shoot_radii=[shoot_radius*(.35+.65*(1-t)**1.1) for t in map(float,np.linspace(0,1,6))];tube(shoot,shoot_radii,6)
  for node in range(6):
   t=.10+node*.17;segment=min(4,int(t*5));origin=shoot[segment].lerp(shoot[segment+1],t*5-segment);angle=az+(node*2.399)+rng.uniform(-.2,.2)
   # Alternate petioles, not opposite olive pairs; broad blades overlap loosely.
   direction=Vector((math.cos(angle),rng.uniform(-.35,.72),math.sin(angle))).normalized();petiole_len=rng.uniform(.035,.055);petiole=origin+direction*petiole_len+Vector((0,.012,0));parent_radius=shoot_radii[segment]*(1-(t*5-segment))+shoot_radii[segment+1]*(t*5-segment);pr=min(.0017,parent_radius*.68);tube([origin,origin.lerp(petiole,.55)+Vector((0,.005,0)),petiole],[pr,pr*.76,pr*.47],4)
   addleaf(petiole,direction,rng.uniform(.16,.205),rng.uniform(-.72,.72),rng.uniform(-1,1))
# Final upright shoot carries a small crown above the main trunk.
for node in range(7 if READING else 9):
 a=node*2.399;origin=trunk[-2].lerp(trunk[-1],.12+node*.10);direction=Vector((math.cos(a),.25,math.sin(a)));petiole=origin+direction*.043;tube([origin,petiole],[.0018,.0008],4);addleaf(petiole,direction,.18,rng.uniform(-.55,.55),rng.uniform(-1,1))
# Scale the authored crown horizontally once; root contract and vertical scale stay.
radius=max(math.hypot(v[0],v[2]) for v in C['v']+B['v']+L['v']+Y['v']);limit=1.10 if not READING else 1.10;factor=min(1,limit/radius)
vertical=(4.35-.70)/(max(v[1] for v in C['v']+B['v']+L['v']+Y['v'])-.70)
for data in [C,B,L,Y]:data['v']=[(p[0]*factor,.70+(p[1]-.70)*vertical,p[2]*factor) for p in data['v']]
assert max(v[1] for v in C['v']+B['v']+L['v']+Y['v'])<4.351

def mesh(name,data,mat):
 me=bpy.data.meshes.new(name);me.from_pydata([xyz(p) for p in data['v']],[],data['f']);me.update();obj=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(obj);me.materials.append(mat);uv=me.uv_layers.new(name='UVMap');col=me.color_attributes.new(name='Tint',type='FLOAT_COLOR',domain='POINT')
 for i,c in enumerate(data['c']):col.data[i].color=c
 for poly in me.polygons:
  poly.use_smooth=True
  for loop in poly.loop_indices:uv.data[loop].uv=data['uv'][me.loops[loop].vertex_index]
 return obj
# Fuse only substantial woody sections; fine shoots/petioles never enter a voxel grid.
coarse=mesh('Fig fused scaffold',C,BM)
bpy.context.view_layer.objects.active=coarse;coarse.select_set(True)
remesh=coarse.modifiers.new('Continuous branch unions','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.003;remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=coarse.modifiers.new('Round living branch collars','SMOOTH');smooth.factor=.65;smooth.iterations=4
bpy.ops.object.modifier_apply(modifier=smooth.name)
coarse.data.calc_loop_triangles();raw_triangles=len(coarse.data.loop_triangles)
decimate=coarse.modifiers.new('Scaffold mobile budget','DECIMATE');decimate.ratio=min(1,6200/max(1,raw_triangles))
bpy.ops.object.modifier_apply(modifier=decimate.name)
# Continuous low-contrast metric skin after union; no inherited cylinder cap seams.
me=coarse.data;uv=me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
col=me.color_attributes.get('Tint') or me.color_attributes.new(name='Tint',type='FLOAT_COLOR',domain='POINT')
for v in me.vertices:col.data[v.index].color=(.96,.96,.96,1)
for poly in me.polygons:
 poly.use_smooth=True
 for li in poly.loop_indices:
  co=me.vertices[me.loops[li].vertex_index].co
  uv.data[li].uv=(math.atan2(co.y,co.x)/math.tau,co.z/.5)
wood=mesh('Fig trunk branches petioles',B,BM)
bpy.ops.object.select_all(action='DESELECT');coarse.select_set(True);wood.select_set(True);bpy.context.view_layer.objects.active=wood;bpy.ops.object.join()
leaves=mesh('Fig mature five lobed laminae',L,LM);young=mesh('Fig young three lobed laminae',Y,YM)

bm=bmesh.new();bm.from_mesh(wood.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(wood.data);bm.free()
for o in [wood,leaves,young]:o['assetRole']='fig-tree';o['rootY']=.70;o['unbakedPBR']=True
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'fig-source.blend'))
target=ROOT/'public/museum'/('fig-'+VARIANT+'.glb')
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=94,export_vertex_color='NAME',export_vertex_color_name='Tint',export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=18,export_draco_normal_quantization=12,export_draco_texcoord_quantization=14)
report={'branchAttachment':'trunk/root/boughs fused at 3mm voxel, smoothed collars, scaffold simplified to6200tri; root radius66%parent, secondary65%, petioles<=68%','variant':VARIANT,'species':'Ficus carica inspired original model','blender':bpy.app.version_string,'leafCount':leafcount,'leafBladeLengthMetresBeforeFinalFit':[.16*1.14*(1.32 if READING else 1.24)*.73,.205*1.14*(1.32 if READING else 1.24)],'petioleMetres':[.047,.083],'rootY':.70,'horizontalFitFactor':factor,'radiusMax':max(math.hypot(v[0],v[2]) for v in C['v']+B['v']+L['v']+Y['v']),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in [wood,leaves,young]),'bytes':target.stat().st_size,'meshBatches':3,'morphologyCounts':morphology_counts,'lamina':'single geometric surface with double-sided opaque material','outlinePoints':len(outlines[0]),'tessellation':'constrained Delaunay; no triangles across lobe sinuses', 'templateTriangles':[len(f) for v,f in templates],'leafTriangles':sum(len(f)-2 for f in L['f']+Y['f']),'textureMemoryMiB':8,'subsurfaceApproximation':'subtle constant diffuse fill only; no transmission render pass','bounds':{'min':np.min(C['v']+B['v']+L['v']+Y['v'],axis=0).tolist(),'max':np.max(C['v']+B['v']+L['v']+Y['v'],axis=0).tolist()},'allGeometryAndTexturesOriginal':True}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n');print('FIG_REPORT '+json.dumps(report))
# Keep the provenance tied to each reproduced artifact, including this generator.
provenance_path=OUT/'provenance.json'
provenance=json.loads(provenance_path.read_text()) if provenance_path.exists() else {'authorship':'Original procedural geometry and textures created for this project','externalMediaUsed':False,'botanicalReferences':['https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A852556-1/general-information','https://plants.ces.ncsu.edu/plants/ficus-carica/','https://www.nparks.gov.sg/florafaunaweb/flora/4/1/4167']}
provenance['files']=[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [TEX/'fig-bark-albedo.png',TEX/'fig-bark-normal.png',TEX/'fig-leaf-albedo.png',TEX/'fig-leaf-normal.png',Path(__file__).resolve(),target]]
provenance_path.write_text(json.dumps(provenance,indent=2)+'\n')
if '--render' in sys.argv:
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=20;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=840;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
 scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.55,.61,.7,1);scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.4
 neutral=bpy.data.materials.new('QA placeholder only');neutral.diffuse_color=(.24,.20,.155,1)
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.48,depth=.74,location=xyz((0,.37,0)));bpy.context.object.data.materials.append(neutral)
 bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.data.materials.append(neutral)
 for pos,power,size in [((3,5,4),450,4),((-3,3,-1),260,3)]:
  bpy.ops.object.light_add(type='AREA',location=xyz(pos));o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector(xyz((0,1.6,0)))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=xyz((3.1,2.8,4.6)));camera=bpy.context.object;camera.rotation_euler=(Vector(xyz((0,2.30,0)))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=4.9;scene.camera=camera;scene.render.filepath=str(ART/('fig-'+VARIANT+'-composition.png'));bpy.ops.render.render(write_still=True)
 camera.location=xyz((1.2,2.3,1.6));camera.rotation_euler=(Vector(xyz((.1,2.1,.08)))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=1.15;scene.render.resolution_x=1000;scene.render.resolution_y=840;scene.render.filepath=str(ART/('fig-'+VARIANT+'-detail.png'));bpy.ops.render.render(write_still=True)
