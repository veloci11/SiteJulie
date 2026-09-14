"""Closed, warmly lit rooms with independent metric material maps and irradiance UVs.
Blender --background --python scripts/blender/build_contemporary_rooms.py -- hall [--preview-only]
Preserves originals, anchors, collision coordinates and the accepted bevel UV correction.
"""
import bpy,bmesh,math,json,sys,time,struct,zlib,hashlib,ctypes as C
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
CONTRACT=json.loads((ROOT/'scripts/blender/contemporary_contract.json').read_text())
STEM=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'hall'
PREVIEW_ONLY='--preview-only' in sys.argv
GEOMETRY_ONLY='--geometry-only' in sys.argv
SKIP_PREVIEW='--skip-preview' in sys.argv
TERMINAL='--terminal' in sys.argv
OUTPUT_STEM=STEM+('-terminal' if TERMINAL else '')
PRIVATE=ROOT/'assets/museum/contemporary-experiments'/OUTPUT_STEM;PRIVATE.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'public/museum/contemporary';OUT.mkdir(exist_ok=True)
START=time.time()
sys.path.insert(0,str(ROOT/'scripts/blender'))
from interior_precision import clear_interfaces,smooth_irradiance,protect_thin_wall_uv,repair_mortar_irradiance
def xyz(p):return (p[0],-p[2],p[1])
def key(p):return tuple(round(v,4) for v in p)
def facekey(points):return tuple(sorted(points))
def log(*s):print('CLEAN_ROOM',*s,flush=True)
def select(objects):
 bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:obj.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
def join(objects,name):
 select(objects)
 if len(objects)>1:bpy.ops.object.join()
 obj=bpy.context.object;obj.name=name;return obj
def unwrap(obj,name):
 select([obj]);uv=obj.data.uv_layers.new(name=name);obj.data.uv_layers.active=uv;uv.active_render=True
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
 bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.004,area_weight=1,correct_aspect=True,scale_to_bounds=True)
 bpy.ops.object.mode_set(mode='OBJECT');return uv
def png(path,linear):
 h,w,_=linear.shape;srgb=np.where(linear<=.0031308,linear*12.92,1.055*np.maximum(linear,0)**(1/2.4)-.055)
 rgb=np.uint8(np.clip(np.rint(srgb[::-1]*255),0,255))
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 raw=b''.join(b'\0'+row.tobytes() for row in rgb)
 path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b''))
def denoise(colors):
 lib=C.CDLL('/Applications/Blender.app/Contents/Resources/lib/libOpenImageDenoise.dylib')
 def api(name,result,args):
  f=getattr(lib,name);f.restype=result;f.argtypes=args;return f
 new=api('oidnNewDevice',C.c_void_p,[C.c_int]);commit=api('oidnCommitDevice',None,[C.c_void_p]);newfilter=api('oidnNewFilter',C.c_void_p,[C.c_void_p,C.c_char_p])
 image=api('oidnSetSharedFilterImage',None,[C.c_void_p,C.c_char_p,C.c_void_p,C.c_int,C.c_size_t,C.c_size_t,C.c_size_t,C.c_size_t,C.c_size_t])
 boolean=api('oidnSetFilterBool',None,[C.c_void_p,C.c_char_p,C.c_bool]);commitfilter=api('oidnCommitFilter',None,[C.c_void_p]);execute=api('oidnExecuteFilter',None,[C.c_void_p])
 error=api('oidnGetDeviceError',C.c_int,[C.c_void_p,C.POINTER(C.c_char_p)]);release=api('oidnReleaseFilter',None,[C.c_void_p]);releasedevice=api('oidnReleaseDevice',None,[C.c_void_p])
 colors=np.ascontiguousarray(colors);result=np.empty_like(colors);h,w,_=colors.shape
 device=new(1);commit(device);f=newfilter(device,b'RT')
 image(f,b'color',colors.ctypes.data,3,w,h,0,0,0);image(f,b'output',result.ctypes.data,3,w,h,0,0,0)
 boolean(f,b'hdr',True);commitfilter(f);execute(f);message=C.c_char_p()
 if error(device,C.byref(message)):raise RuntimeError(message.value)
 release(f);releasedevice(device);return result
def material(name,path,uvname,scale=1,color=None):
 mat=bpy.data.materials.new(name);mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links
 tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(path),check_existing=False);tex.image.colorspace_settings.name='sRGB';tex.image.pack()
 uv=n.new('ShaderNodeUVMap');uv.uv_map=uvname;l.new(uv.outputs[0],tex.inputs['Vector']);l.new(tex.outputs[0],n.get('Principled BSDF').inputs['Base Color'])
 if name.startswith('LIGHTMAP '):mat['lightmapRadianceScale']=scale;mat['plasterColorLinear']=list(color);mat['lightmapTexCoord']=1;mat['lightmapIncludes']='diffuse direct+indirect only; no albedo; no normal detail'
 else:mat['bakeRadianceScale']=scale
 return mat
def replace(obj,mat):
 obj.data.materials.clear();obj.data.materials.append(mat)
 for p in obj.data.polygons:p.material_index=0


bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum'/(STEM+'.blend')))
scene=bpy.context.scene
for anchor_name,position in CONTRACT['anchors'][STEM].items():
 anchor=scene.objects.get('anchor_'+anchor_name)
 if anchor is None:raise RuntimeError('Missing base artwork anchor: '+anchor_name)
 anchor.matrix_world.translation=Vector(xyz(position))
scene.render.engine='CYCLES';scene.cycles.samples=128;scene.cycles.use_denoising=True;scene.cycles.max_bounces=10;scene.cycles.diffuse_bounces=8
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
scene.cycles.device='GPU';scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.95,.97,1,1);scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.025
for o in list(scene.objects):
 if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
color=(.68,.595,.48) if STEM=='hall' else (.63,.485,.385)
wallmat=bpy.data.materials.new('Contemporary matte plaster');wallmat.use_nodes=True;wallmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
def box(name,pos,size,mat,bevel=.012):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(pos));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  m=o.modifiers.new('Precision eased edge','BEVEL');m.width=bevel;m.segments=5;bpy.ops.object.modifier_apply(modifier=m.name)
  for polygon in o.data.polygons:polygon.use_smooth=True
  m=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL');m.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=m.name)
 return o
removed=[]
for o in list(scene.objects):
 if o.type=='MESH' and any(k in o.data.materials[0].name.lower() for k in ['plaster','olive','glass','walnut','linen','jute','book','paper','ceramic','terracotta','travertine base','planter','lamp diffuser','limestone sculpture']):
  removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
def simplemat(name,tint):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*tint,1);return m
wood=simplemat('Natural walnut grain',(.2,.15,.1));linen=simplemat('Contemporary linen',(.5,.48,.43));metal=simplemat('Graphite anodised aluminum',(.04,.042,.045));stone=simplemat('Travertine planter',(.45,.44,.41));base=simplemat('Warm travertine base',(.44,.43,.40))
emitter=simplemat('Warm lamp diffuser',(.8,.81,.77));bs=emitter.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.96,.88,1);bs.inputs['Emission Strength'].default_value=2
height=5.95 if STEM=='hall' else 5.7

def portal(name,axis,fixed,lo,hi,center,half,opening,depth=.3):
 # One continuous extruded wall with its aperture: no stacked intrados surfaces.
 radius=.28;outline=[(lo,0),(lo,height),(hi,height),(hi,0),(center+half,0),(center+half,opening-radius)]
 for i in range(1,13):
  a=i*math.pi/24;outline.append((center+half-radius+radius*math.cos(a),opening-radius+radius*math.sin(a)))
 outline.append((center-half+radius,opening))
 for i in range(1,13):
  a=math.pi/2+i*math.pi/24;outline.append((center-half+radius+radius*math.cos(a),opening-radius+radius*math.sin(a)))
 outline.append((center-half,0));count=len(outline)
 def coord(u,y,d):return xyz((u,y,fixed+d)) if axis=='z' else xyz((fixed+d,y,u))
 verts=[coord(u,y,d) for d in [-depth/2,depth/2] for u,y in outline]
 faces=[tuple(range(count-1,-1,-1)),tuple(range(count,count*2))]+[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(wallmat);obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);select([obj])
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
 bevel=obj.modifiers.new('Continuous softly eased aperture','BEVEL');bevel.width=.025;bevel.segments=3;bpy.ops.object.modifier_apply(modifier=bevel.name)
 return obj
for side in [-1,1]:portal('Quiet side gallery portal','x',side*6,-9,9,-6.5,1.3,4.8)
if TERMINAL:box('Continuous terminal plaster wall',(0,height/2,8.925),(12,height,.15),wallmat,0)
else:portal('Front gallery portal','z',8.925,-6,6,0,1.6,5.4,.15)
if STEM=='extension':portal('Internal gallery portal','z',-8.925,-6,6,0,1.6,5.4,.15)
else:box('Uninterrupted portrait wall',(0,height/2,-9),(12,height,.3),wallmat,.015)
# One unbroken closed ceiling and calm, complete alcoves.
ceilingmat=simplemat('Contemporary ceiling plaster',(.74,.74,.71))
box('Continuous contemporary ceiling',(0,height+.075,0),(12.28,.15,CONTRACT['ceilingLength']),ceilingmat,.014)
for side in [-1,1]:
 box('Editorial side wall',(side*10,2.8,-6.5),(.3,5.6,5),wallmat,.018)
 for z in [-9,-4]:box('Editorial return',(side*8,2.8,z),(4,5.6,.3),wallmat,.018)
 box('Editorial closed ceiling',(side*8,5.62,-6.5),(4.1,.14,5.15),wallmat,.015)
 box('Floating alcove seat',(side*8.2,.52,-8.52),(2.25,.13,.60),wood,.025)
 box('Alcove upholstered seat',(side*8.2,.61,-8.52),(2.19,.09,.56),linen,.025)
 box('Quiet editorial ledge',(side*9.73,1.1,-6.5),(.36,.06,2.2),wood,.012)
# A lateral reading bench in Visages, a low seat facing the central fig in Recits.
BENCHES=CONTRACT['benchesByModule'][STEM]
for placement in BENCHES:
 x,_,z=placement['position'];length=placement['length'];width=placement['width'];rotation=placement['rotationY'];before=set(scene.objects)
 box('Slim walnut exhibition bench',(0,.49,0),(length,.09,width),wood,.035)
 box('Tailored taupe upholstered pad',(0,.62,0),(length-.08,.18,width-.08),linen,.05)
 for dx in [-length*.385,length*.385]:box('Graphite bench support',(dx,.235,0),(.055,.43,width-.21),metal,.012)
 for obj in set(scene.objects)-before:
  p=obj.location.copy();obj.location=Vector((x+p.x*math.cos(rotation)+p.y*math.sin(rotation),-z-p.x*math.sin(rotation)+p.y*math.cos(rotation),p.z));obj.rotation_euler.z=-rotation
box('Sculpture console top',(5.15,.9,7.9),(.72,.07,1.15),wood,.018)
for z in [7.44,8.36]:box('Sculpture console support',(5.15,.43,z),(.57,.84,.055),metal,.009)
box('Contemporary sculpture pedestal',(-5,.45,7.9),(.68,.90,.68),wallmat,.012)
# Original sculptures are preserved; pots are now quiet tapered mineral cylinders.
def pot(x,z,radius,height):
 scale=1
 profile=[(.015,radius*.82),(.045,radius*.85),(height-.05,radius),(height,radius),(height,radius-.035),(height-.04,radius-.035)]
 verts=[];faces=[];segments=64
 for y,r in profile:
  for i in range(segments):a=math.tau*i/segments;verts.append(xyz((x+math.cos(a)*r*scale,y*scale,z+math.sin(a)*r*scale)))
 for j in range(len(profile)-1):
  for i in range(segments):a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
 faces.append(tuple(range(segments-1,-1,-1)));m=bpy.data.meshes.new('Tapered mineral pot');m.from_pydata(verts,[],[tuple(reversed(f)) for f in faces]);m.materials.append(stone);o=bpy.data.objects.new('Tapered mineral pot',m);scene.collection.objects.link(o)
 for p in m.polygons:p.use_smooth=len(p.vertices)==4
TREE_PLACEMENTS=CONTRACT['treesByModule'][STEM]
for t in TREE_PLACEMENTS:pot(t['position'][0],t['position'][2],t['potRadius'],t['potHeight'])
# Replace soil discs at the exact enlarged root level; rear trees removed to preserve artwork sightlines.
for obj in list(scene.objects):
 if obj.type=='MESH' and obj.data.materials and 'soil' in obj.data.materials[0].name.lower():bpy.data.objects.remove(obj,do_unlink=True)
soil=simplemat('Rich organic soil',(.10,.075,.045))
for t in TREE_PLACEMENTS:
 x,_,z=t['position'];bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=t['potRadius']-.041,depth=.025,location=xyz((x,t['soilY'],z)));bpy.context.object.name='Enlarged root soil';bpy.context.object.data.materials.append(soil)
# Distinct contemporary material interventions, outside artwork rectangles and routes.
accent=simplemat('Rose clay accent plaster',(.53,.335,.25))
if STEM=='hall':
 ceilingwood=simplemat('Natural walnut ceiling veneer',(.76,.58,.39))
 for x in [-3.5,3.5]:box('Warm timber acoustic ceiling panel',(x,height-.035,0),(1.55,.055,14.4),ceilingwood,.018)
 box('Portrait gallery low walnut dado',CONTRACT['portraitDado']['position'],CONTRACT['portraitDado']['size'],wood,.012)
else:
 box('Earth toned floating ceiling field',(0,height-.035,0),(6.8,.05,14.4),accent,.018)
 for side in [-1,1]:
  # Slats live inside editorial alcoves, below the editorial title; no artwork slot is covered.
  for i in range(19):box('Walnut editorial rhythm',(side*(6.5+i*.16),1.45,-8.77),(.065,2.65,.045),wood,.009)
  box('Rose clay editorial backdrop',(side*9.81,1.55,-6.5),(.045,2.9,3.4),accent,.012)
# Handmade objects: open lathed ceramic, simple unlettered books, softly rounded cushions.
ceramic=simplemat('Warm matte porcelain',(.70,.56,.40));terracotta=simplemat('Terracotta handmade vessel',(.45,.225,.12));paper=simplemat('Warm paper edges',(.77,.71,.60));covers=[simplemat('Book cover '+str(i),c) for i,c in enumerate([(.25,.29,.14),(.39,.22,.11),(.53,.40,.24)])]
def vessel(name,x,y,z,scale,mat):
 profile=[(0,.15),(.025,.18),(.11,.22),(.28,.24),(.43,.17),(.54,.105),(.555,.107),(.555,.080),(.52,.081),(.43,.14),(.28,.21),(.11,.19),(.04,.15)]
 verts=[];faces=[];n=48
 for h,r in profile:
  for i in range(n):a=math.tau*i/n;verts.append(xyz((x+math.cos(a)*r*scale,y+h*scale,z+math.sin(a)*r*scale)))
 for j in range(len(profile)-1):
  for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[tuple(reversed(f)) for f in faces]);mesh.materials.append(mat);obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
 for face in mesh.polygons:face.use_smooth=True
for side in [-1,1]:
 vessel('Hand thrown editorial vessel',side*9.65,1.13,-6.0,.50,ceramic if STEM=='hall' else terracotta)
 for i in range(3):
  box('Unlettered editorial book',(side*9.68,1.145+i*.043,-6.85),(.26,.032,.44),paper,.005)
  box('Quiet cloth book cover',(side*9.68,1.164+i*.043,-6.85),(.27,.008,.45),covers[i],.003)
# One deliberately placed volume; no mirrored duplicate scene dressing.
if STEM=='hall':
 box('Reading volume paper',(-2.2,.735,4.24),(.32,.025,.38),paper,.005)
 box('Reading volume linen binding',(-2.2,.751,4.24),(.33,.007,.39),covers[1],.004)
# Original contemporary sculptures, each different in silhouette, scale and gesture.
sculpt=simplemat('Limestone sculpture',(.94,.91,.80))
def loop_sculpture(name,center,rx,ry,tube,twist=0,mat=None):
 vertices=[];faces=[];n=80;m=12
 for i in range(n):
  a=i*math.tau/n;rad=1+.1*math.sin(3*a);x=rx*math.cos(a)*rad;y=ry*math.sin(a);z=twist*math.sin(2*a)
  for j in range(m):
   b=j*math.tau/m;vertices.append(xyz((center[0]+x+tube*math.cos(a)*math.cos(b),center[1]+y+tube*math.sin(a)*math.cos(b),center[2]+z+tube*.70*math.sin(b))))
 for i in range(n):
  for j in range(m):faces.append((i*m+j,((i+1)%n)*m+j,((i+1)%n)*m+(j+1)%m,i*m+(j+1)%m))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(mat or sculpt);obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
 for face in mesh.polygons:face.use_smooth=True
if STEM=='hall':
 loop_sculpture('Vertical open stone gesture',(-5,1.45,7.9),.21,.45,.085,.045)
 for i,(dx,rx,ry) in enumerate([(-.08,.22,.12),(.055,.18,.10)]):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=xyz((5.15+dx,1.07+i*.19,7.9)));o=bpy.context.object;o.name='Balanced river stone';o.scale=(rx,.28-i*.025,ry);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(sculpt)
  for face in o.data.polygons:face.use_smooth=True
else:
 # A solid rising gesture contrasts with the open loop in Visages.
 vertices=[];faces=[];rings=42;sides=24
 for j in range(rings):
  t=j/(rings-1);r=.014+.16*math.sin(math.pi*t)**.65;cx=.12*math.sin(math.tau*t)
  for k in range(sides):
   a=k*math.tau/sides;vertices.append(xyz((-5+cx+r*math.cos(a),.90+1.18*t,7.9+r*.68*math.sin(a))))
 for j in range(rings-1):
  for k in range(sides):faces.append((j*sides+k,j*sides+(k+1)%sides,(j+1)*sides+(k+1)%sides,(j+1)*sides+k))
 faces.extend([tuple(reversed(range(sides))),tuple((rings-1)*sides+k for k in range(sides))]);mesh=bpy.data.meshes.new('Solid ascending stone gesture');mesh.from_pydata(vertices,[],faces);mesh.materials.append(sculpt);obj=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(obj)
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
 for face in mesh.polygons:face.use_smooth=True
 loop_sculpture('Low circular terracotta gesture',(5.15,1.17,7.9),.22,.19,.065,.02,terracotta)

# A coherent reading group; fine woven rug, low chair and a small walnut table.
if STEM=='hall':
 r=CONTRACT['readingCorner'];rugmat=simplemat('Natural reading jute rug',(.62,.52,.39))
 rug=box('Quiet woven reading rug',r['rug']['position'],r['rug']['size'],rugmat,.003)
 # Rounded, flattened rolled hem gives the textile a soft edge instead of a slab.
 hem=simplemat('Reading jute sewn border',(.46,.40,.32));verts=[];faces=[];outline=[]
 rx,ry,rz=r['rug']['position'];w,_,d=r['rug']['size'];corner=.075
 for cx,cz,start in [(w/2-corner,d/2-corner,0),(-w/2+corner,d/2-corner,90),(-w/2+corner,-d/2+corner,180),(w/2-corner,-d/2+corner,270)]:
  for i in range(13):
   a=math.radians(start+i*90/12);outline.append(Vector((cx+corner*math.cos(a),cz+corner*math.sin(a))))
 # The four arcs are connected by straight sides through their ordered endpoints.
 n=len(outline);cross=8
 for i,p in enumerate(outline):
  tangent=(outline[(i+1)%n]-outline[(i-1)%n]).normalized();normal=Vector((tangent.y,-tangent.x))
  for k in range(cross):
   a=k*math.tau/cross;v=p+normal*(.018*math.cos(a));verts.append(xyz((rx+v.x,.014+.004*math.sin(a),rz+v.y)))
 for i in range(n):
  for k in range(cross):faces.append((i*cross+k,((i+1)%n)*cross+k,((i+1)%n)*cross+(k+1)%cross,i*cross+(k+1)%cross))
 mesh=bpy.data.meshes.new('Soft rolled rug binding');mesh.from_pydata(verts,[],faces);mesh.materials.append(hem);o=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(o)
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
 for face in mesh.polygons:face.use_smooth=True

 cx,_,cz=r['chair']['position']
 box('Reading chair walnut shell',(cx,.37,cz),(.81,.10,.83),wood,.045)
 box('Reading chair soft seat',(cx,.48,cz-.015),(.75,.16,.72),linen,.065)
 box('Reading chair upholstered back',(cx,.66,cz+.32),(.75,.40,.14),linen,.060)
 for dx in [-.31,.31]:
  for dz in [-.29,.29]:box('Reading chair walnut leg',(cx+dx,.19,cz+dz),(.055,.36,.055),wood,.012)
 tx,_,tz=r['table']['position']
 box('Reading table rounded walnut top',(tx,.39,tz),(.82,.075,.66),wood,.075/2)
 for dx in [-.30,.30]:box('Reading table sculpted support',(tx+dx,.19,tz),(.06,.36,.46),wood,.014)
 for i in range(2):
  box('Reading table unlettered volume',(tx-.15,.441+i*.036,tz+.08),(.31,.028,.35),paper,.004)
  box('Reading table cloth binding',(tx-.15,.458+i*.036,tz+.08),(.32,.006,.36),covers[i],.002)
 vessel('Reading cup',tx+.21,.43,tz-.13,.115,ceramic)

# V5 return generator retained for archived configurations; active V6 has none.
# Short, genuinely spatial returns between artwork bays. Each niche is an open
# recess made from a continuous frame, never a decal or a second artwork surface.
niche_lights=[]
for partition in CONTRACT.get('partitionsByModule',{}).get(STEM,[]):
 name=partition['name'];x,y,z=partition['position'];width,h,depth=partition['size'];style=partition['style']
 if style in {'reading-niche','sculpture-niche'}:
  opening_width=width-.64;bottom=.80 if style=='reading-niche' else .95;top=h-.42
  # One watertight recessed wall. The front ring has no assembly seams or
  # duplicated jamb caps; the cavity stops before the solid rear face.
  outer=[(-width/2,0),(width/2,0),(width/2,h),(-width/2,h)]
  inner=[(-opening_width/2,bottom),(opening_width/2,bottom),(opening_width/2,top),(-opening_width/2,top)]
  verts=[xyz((x+px,py,pz)) for outline,pz in [(outer,z+depth/2),(outer,z-depth/2),(inner,z+depth/2),(inner,z-depth/2+.045)] for px,py in outline]
  faces=[]
  for i in range(4):
   j=(i+1)%4;faces.extend([(i,j,8+j,8+i),(i,4+i,4+j,j),(8+i,8+j,12+j,12+i)])
  faces.extend([(4,5,6,7),(12,13,14,15)])
  mesh=bpy.data.meshes.new(name+' continuous recess');mesh.from_pydata(verts,[],faces);mesh.materials.append(wallmat)
  obj=bpy.data.objects.new(name+' continuous recess',mesh);scene.collection.objects.link(obj);select([obj])
  bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
  bevel=obj.modifiers.new('Soft continuous niche arris','BEVEL');bevel.width=.012;bevel.segments=3;bpy.ops.object.modifier_apply(modifier=bevel.name)
  backing=wood if style=='reading-niche' else accent
  box(name+' recessed backing',(x,(bottom+top)/2,z-depth/2+.052),(opening_width-.035,top-bottom-.025,.012),backing,.005)
  box(name+' inset display shelf',(x,bottom+.027,z+.012),(opening_width-.03,.052,depth-.045),wood,.008)
  box(name+' concealed warm diffuser',(x,top-.022,z+.035),(opening_width-.10,.012,.04),emitter,.004)
  niche_lights.append((name,(x,top-.055,z+.067),(x,bottom+.1,z+.015),opening_width-.10))
  if style=='reading-niche':
   for i in range(5):
    bx=x-.48+i*.12;bh=.29+.045*(i%3)
    box(name+' unlettered upright paper',(bx,bottom+.055+bh/2,z+.012),(.072,bh,.11),paper,.004)
    box(name+' cloth book spine',(bx,bottom+.055+bh/2,z+.073),(.078,bh+.012,.01),covers[i%3],.003)
   vessel(name+' small ceramic',x+.46,bottom+.054,z+.018,.29,ceramic)
  else:
   loop_sculpture(name+' original terracotta miniature',(x,bottom+.36,z+.02),.19,.28,.047,.01,terracotta)
 elif style=='timber-return':
  # Cut a real shallow veneer recess; no coincident plaster plane behind its face.
  panel_lo=.34;panel_hi=.76
  left_width=width/2+panel_lo;right_width=width/2-panel_hi
  box(name+' left plaster body',(x-width/2+left_width/2,h/2,z),(left_width,h,depth),wallmat,.018)
  box(name+' right plaster body',(x+panel_hi+right_width/2,h/2,z),(right_width,h,depth),wallmat,.018)
  box(name+' recessed plaster bed',(x+.55,h/2,z-.008),(.42,h,depth-.016),wallmat,.006)
  box(name+' warm timber inset',(x+.55,h*.51,z+depth/2-.006),(.42,h-.32,.012),wood,.004)
 else:
  box(name+' low plaster body',(x,h/2-.016,z),(width,h-.032,depth),wallmat,.02)
  box(name+' quiet walnut coping',(x,h-.016,z),(width,.032,depth),wood,.012)

# Wall-mounted V6 details stay behind every painting's front plane. Separate
# material metadata lets the exported GLB itself prove the complete envelope.
detail_materials={}
def detail_mat(original):
 if original.name not in detail_materials:
  mat=original.copy();mat.name=original.name+' shallow wall detail';mat['wallDetailsOnly']=True;detail_materials[original.name]=mat
 return detail_materials[original.name]
for detail in CONTRACT.get('wallDetailsByModule',{}).get(STEM,[]):
 name=detail['name'];x,y,z=detail['position'];depth,h,width=detail['size'];style=detail['style'];side=1 if x>0 else -1
 lo=y-h/2;hi=y+h/2
 backing=detail_mat(wood if style=='walnut-insert' else wallmat)
 box(name+' slim backing',(side*5.841,y,z),(.014,h,width),backing,.005)
 if style=='walnut-insert':
  # Three broad, flat veneer leaves with two restrained 2mm architectural joints.
  # Continue to the ceiling, instead of a radiator-like collection of tubes.
  pitch=width/3
  for i in range(3):
   bz=z-width/2+pitch*(i+.5)
   box(name+' continuous smooth veneer',(side*5.820,y,bz),(.026,h-.002,pitch-.002),detail_mat(wood),.002)
 else:
  raise ValueError('Only accepted walnut inserts belong in the active wall-detail contract')

# Discreet graphite ceiling tracks and physical adjustable luminaire bodies.
for x in [-4.35,4.35]:box('Slim ceiling lighting track',(x,height-.095,0),(.045,.035,15.4),metal,.004)
box('Rear ceiling lighting track',(0,height-.095,-7.42),(8.1,.035,.045),metal,.004)
box('Front ceiling lighting track',(0,height-.095,7.42),(8.1,.035,.045),metal,.004)
def area(name,pos,target,power,size,color=(1,.96,.90),size_y=None):
 bpy.ops.object.light_add(type='AREA',location=xyz(pos));o=bpy.context.object;o.name=name;o.rotation_euler=(Vector(xyz(target))-o.location).to_track_quat('-Z','Y').to_euler();o.data.energy=power*1.5;o.data.color=color;o.data.shape='RECTANGLE';o.data.size=size;o.data.size_y=size_y or size
for name,pos,target,width in niche_lights:area(name+' integrated shelf light',pos,target,.65,width,(1,.93,.85),.025)
for z in [-3.6,3.6]:area('Concealed ceiling diffuse fill',(0,height-.12,z),(0,0,z),80,4.5,(1,.97,.92),4)
for side in [-1,1]:
 area('Ceiling indirect reflected fill',(side*4.8,4.95,0),(side*2,height,0),35,6,(1,.98,.95),.6)
 area('Continuous soft gallery wallwash',(side*4.75,4.75,0),(side*5.86,2.7,0),60,7.5,(1,.96,.90),.5)
 area('Corner foliage soft modelling',(side*3.8,4.5,5.1),(side*5,1.7,4.1),25,1.4,(1,.95,.87))
 area('Editorial alcove light',(side*8,5.2,-6.5),(side*9.8,2.8,-6.5),35,2.0,(1,.96,.91))
area('Restrained back wall wash',(0,4.8,-7.5),(0,2.7,-8.9),40,7,(1,.97,.93),.6)
spots=[((-4.35,height-.28,2),(-5.86,2.65,2)),((4.35,height-.28,2),(5.86,2.65,2))]+([((0,height-.28,-7.42),(0,2.65,-8.86)),((3.5,height-.28,7.42),(3.5,2.65,8.86))] if STEM=='hall' else [((-3.5,height-.28,-7.42),(-3.5,2.65,-8.86)),((3.5,height-.28,7.42),(3.5,2.65,8.86))])
for pos,target in spots:
 direction=(Vector(xyz(target))-Vector(xyz(pos))).normalized();mid=Vector(xyz(pos));rot=direction.to_track_quat('-Z','Y').to_euler()
 bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.068,depth=.19,location=mid);o=bpy.context.object;o.name='Precision adjustable gallery spot';o.rotation_euler=rot;o.data.materials.append(metal)
 bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.054,depth=.003,location=mid+direction*.096);o=bpy.context.object;o.name='Recessed spotlight lens';o.rotation_euler=rot;o.data.materials.append(emitter)
 bpy.ops.object.light_add(type='SPOT',location=mid+direction*.10);o=bpy.context.object;o.name='Soft exhibition accent';o.rotation_euler=rot;o.data.energy=65;o.data.color=(1,.96,.91);o.data.spot_size=math.radians(64);o.data.spot_blend=.78;o.data.shadow_soft_size=.13
cap=None  # Terminal rooms use a genuinely continuous wall, not a closed doorway overlay.
shadow_trees=[];tree_hashes={}
for t in ([] if GEOMETRY_ONLY else TREE_PLACEMENTS):
 x,y,z=t['position'];scale=t['scale'];rotation=t['rotationY']
 tree_path=ROOT/('public'+t['asset']);tree_hashes[t['asset']]=hashlib.sha256(tree_path.read_bytes()).hexdigest()
 before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(tree_path));imported=set(scene.objects)-before
 for o in imported:
  if o.parent is None:o.location=xyz((x,y,z));o.scale=(scale,scale,scale);o.rotation_euler.z=rotation
  o['interiorShadowOnly']=True
 shadow_trees.extend(imported)
# Source data: one material per original mesh, no prior AO colors or atlas albedo.
groups={'walls':[],'floor':[],'furniture':[]};specs={}
def specification(name):
 lower=name.lower()
 if 'graphite' in lower:return ('furniture','metal',(.045,.048,.052),1,.55,0)
 if 'rose clay' in lower:return ('walls',None,(.53,.335,.25),1,.95,0)
 if 'ceiling plaster' in lower:return ('walls',None,(.74,.74,.71),1,.95,0)
 if 'plaster' in lower:return ('walls',None,color,1,.92,.0)
 if 'mortar' in lower:return ('floor','mortar',(.47,.447,.39) if STEM=='hall' else (.45,.422,.375),1,.90,0)
 if any(s in lower for s in ['sand travertine','clay floor']):return ('floor','stone',(.69,.65,.585) if STEM=='hall' else (.66,.615,.56),1.2,.78,.12)
 if 'travertine base' in lower:return ('floor','stone',(.72,.74,.76),1.2,.54,.12)
 if 'walnut' in lower:return ('furniture','wood',(.76,.58,.39) if STEM=='hall' else (.61,.39,.25),2.2 if 'ceiling' in lower else .60,.84,.04 if 'ceiling' in lower else .055)
 if 'linen' in lower:return ('furniture','linen',(.68,.575,.445) if STEM=='hall' else (.53,.33,.235),.032,.96,.12)
 if 'jute' in lower:return ('furniture','jute',(.46,.40,.32) if 'border' in lower else (.58,.50,.40),.12,.98,.18)
 if 'planter' in lower:return ('furniture','stone',(.69,.60,.48) if STEM=='hall' else (.56,.38,.27),1.2,.85,.12)
 if 'limestone sculpture' in lower:return ('furniture','stone',(.94,.91,.80),.7,.68,.10)
 if 'soil' in lower:return ('furniture','soil',(.10,.075,.045),1,1,0)
 if 'paper' in lower:return ('furniture','paper',(.77,.71,.60),1,.90,0)
 if 'book cover' in lower:
  i=int(name[-1]);return ('furniture','book',[(.25,.29,.14),(.39,.22,.11),(.53,.40,.24)][i],1,.82,0)
 if 'porcelain' in lower:return ('furniture','ceramic',(.70,.56,.40),1,.65,0)
 if 'terracotta' in lower:return ('furniture','ceramic',(.42,.23,.12),1,.56,0)
 return ('furniture','ceramic',(.53,.40,.24),1,.40,0)

def metric_uv(obj,wood=False):
 for uv in list(obj.data.uv_layers):obj.data.uv_layers.remove(uv)
 uv=obj.data.uv_layers.new(name='MetricUV');uv.active_render=True
 # Project each connected timber member separately along its own longest axis.
 parents=list(range(len(obj.data.vertices)))
 def r(i):
  while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
  return i
 for edge in obj.data.edges:
  a,b=map(r,edge.vertices);parents[a]=b
 bounds={}
 world=[obj.matrix_world@v.co for v in obj.data.vertices]
 for i,p in enumerate(world):bounds.setdefault(r(i),[]).append(p)
 spans={k:[max(p[i] for p in pts)-min(p[i] for p in pts) for i in range(3)] for k,pts in bounds.items()}
 for p in obj.data.polygons:
  normal=obj.matrix_world.to_3x3()@p.normal;axis=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=axis]
  if wood:axes.sort(key=lambda i:spans[r(p.vertices[0])][i],reverse=True)
  for i in p.loop_indices:
   point=world[obj.data.loops[i].vertex_index];uv.data[i].uv=(point[axes[0]],point[axes[1]])
 return uv

def pbr(mat,spec):
 group,kind,tint,period,rough,normalstrength=spec;mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear();out=n.new('ShaderNodeOutputMaterial');b=n.new('ShaderNodeBsdfPrincipled');l.new(b.outputs[0],out.inputs['Surface']);b.inputs['Base Color'].default_value=(*tint,1);b.inputs['Roughness'].default_value=rough
 if kind not in {'stone','wood','linen','jute'}:return
 uv=n.new('ShaderNodeUVMap');uv.uv_map='MetricUV';mapping=n.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=1/period;l.new(uv.outputs[0],mapping.inputs[0])
 def tex(suffix,space):
  t=n.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(OUT/'details'/(kind+'-'+suffix+'.webp')),check_existing=True);t.image.colorspace_settings.name=space;l.new(mapping.outputs[0],t.inputs['Vector']);return t
 t=tex('base','sRGB');mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*tint,1);l.new(t.outputs['Color'],mix.inputs[1]);l.new(mix.outputs[0],b.inputs['Base Color'])
 t=tex('normal','Non-Color');normal=n.new('ShaderNodeNormalMap');normal.uv_map='MetricUV';normal.inputs['Strength'].default_value=normalstrength;l.new(t.outputs['Color'],normal.inputs['Color']);l.new(normal.outputs[0],b.inputs['Normal'])
 if kind in {'stone','wood'}:
  t=tex('roughness','Non-Color');multiply=n.new('ShaderNodeMath');multiply.operation='MULTIPLY';multiply.inputs[1].default_value=rough;l.new(t.outputs['Color'],multiply.inputs[0]);l.new(multiply.outputs[0],b.inputs['Roughness'])
for obj in list(scene.objects):
 if obj.type!='MESH' or obj==cap or obj.get('interiorShadowOnly'):continue
 name=obj.data.materials[0].name
 for a in list(obj.data.color_attributes):obj.data.color_attributes.remove(a)
 if 'lamp diffuser' in name.lower():continue
 spec=specification(name);groups[spec[0]].append(obj);metric_uv(obj,spec[1]=='wood')
 for mat in obj.data.materials:
  specs[mat.name]=spec;pbr(mat,spec)
if cap:metric_uv(cap);specs[wallmat.name]=('walls',None,color,1,.92,0)
removed_internal_faces=0;shifted_ribs=0
precision={'continuousApertureMesh':True,'legacyArchesRemoved':True}
for obj in groups['floor']:
 if obj.data.materials[0].name=='Fine warm mortar':
  inverse=obj.matrix_world.inverted()
  for v in obj.data.vertices:
   p=obj.matrix_world@v.co
   if abs(p.z+.01)<.0001:p.z=.004;v.co=inverse@p
wall_feet=0
for obj in groups['walls']:
 inverse=obj.matrix_world.inverted()
 for vertex in obj.data.vertices:
  p=obj.matrix_world@vertex.co
  if -.001<=p.z<.041:
   p.z-=.05;vertex.co=inverse@p;wall_feet+=1
 obj.data.update()
precision['buriedWallFootVertices']=wall_feet;precision['wallFootLoweringMeters']=.05
log('REFINED',removed_internal_faces,shifted_ribs,'closed ceilings',removed)
detail_proof=[]
details=CONTRACT.get('wallDetailsByModule',{}).get(STEM,[])
for obj in scene.objects:
 if obj.type!='MESH' or not obj.data.materials or not all(m.get('wallDetailsOnly') for m in obj.data.materials):continue
 points=[obj.matrix_world@v.co for v in obj.data.vertices];world=[(p.x,p.z,-p.y) for p in points]
 for p in world:
  assert any(all(abs(p[i]-d['position'][i])<=d['size'][i]/2+.00002 for i in range(3)) for d in details),(obj.name,p,'outside approved shallow box')
 detail_proof.append({'name':obj.name,'vertices':len(world),'min':[min(p[i] for p in world) for i in range(3)],'max':[max(p[i] for p in world) for i in range(3)]})
precision['wallDetailObjects']=detail_proof
if GEOMETRY_ONLY:
 (ROOT/'artifacts/museum'/(OUTPUT_STEM+'-shallow-source-geometry.json')).write_text(json.dumps(precision,indent=2));log('GEOMETRY_ONLY_PASSED',len(detail_proof));sys.exit(0)
# Save a genuine physically lit source before atlas conversion.
scene['treeAssetSHA256']=json.dumps(tree_hashes)
bpy.ops.wm.save_as_mainfile(filepath=str(PRIVATE/(OUTPUT_STEM+'-contemporary-pbr.blend')))
if not SKIP_PREVIEW:
 bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.location=xyz((.8,1.8,8.2));cam.rotation_euler=(Vector(xyz((-2.2,2.2,-6.5)))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=23
 scene.render.resolution_x=1440;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.filepath=str(ROOT/'artifacts/museum'/(OUTPUT_STEM+'-contemporary-pbr.png'));bpy.ops.render.render(write_still=True)
if PREVIEW_ONLY:sys.exit(0)
report={'authoredLatheWinding':'outward','interfacePrecision':precision,'module':STEM,'closedCeiling':True,'trees':TREE_PLACEMENTS,'partitions':CONTRACT.get('partitionsByModule',{}).get(STEM,[]),'wallDetails':CONTRACT.get('wallDetailsByModule',{}).get(STEM,[]),'terminalWall':TERMINAL,'removedLegacyMeshes':removed,'refinement':{'internalFacesRemoved':removed_internal_faces,'vaultRibsLowered':shifted_ribs,'mortarTopY':.004},'atlases':[],'surfaces':[]}
report['treeAssetSHA256']=tree_hashes;report['generalPreviewSkipped']=SKIP_PREVIEW

def surface_material(name,path,uvname,scale,spec):
 group,kind,tint,period,rough,normalstrength=spec
 mat=material(name,path,uvname,scale,tint if group=='walls' else None)
 if group!='walls':
  mat['lightmapRadianceScale']=scale;mat['surfaceKind']=kind;mat['surfaceColorLinear']=list(tint);mat['surfacePeriodMeters']=period;mat['surfaceRoughness']=rough;mat['surfaceNormalStrength']=normalstrength;mat['lightmapTexCoord']=1;mat['lightmapIncludes']='diffuse direct+indirect; no color or normal detail';mat['lightmapUnit']='white diffuse radiance; Three Standard lightMapIntensity=scale*pi'
 return mat

deliveries=[];baked={}
for group in ['walls','floor','furniture']+(['cap'] if cap else []):
 obj=cap if group=='cap' else join(groups[group],('LIGHTMAP ' if group=='walls' else 'SURFACE ')+STEM+' '+group);baked[group]=obj;unwrap(obj,'LightUV');size=512 if group=='cap' else 2048
 image=bpy.data.images.new(STEM+' interior '+group,width=size,height=size,float_buffer=True,alpha=False);image.colorspace_settings.name='Linear Rec.709'
 # Do not bake fine normal maps into the low-frequency irradiance atlas.
 detached=[]
 for mat in obj.data.materials:
  b=mat.node_tree.nodes.get('Principled BSDF')
  for link in list(b.inputs['Normal'].links):detached.append((mat,link.from_socket,link.to_socket));mat.node_tree.links.remove(link)
  node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.nodes.active=node
 select([obj]);scene.render.bake.use_pass_color=False;scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True;scene.render.bake.margin=32;scene.render.bake.margin_type='EXTEND'
 log('INTERIOR_BAKE_BEGIN',group);bpy.ops.object.bake(type='DIFFUSE',use_selected_to_active=False)
 for mat,a,b in detached:mat.node_tree.links.new(a,b)
 image.filepath_raw=str(PRIVATE/(group+'-irradiance.exr'));image.file_format='OPEN_EXR';image.save()
 pixels=np.empty(size*size*4,dtype=np.float32);image.pixels.foreach_get(pixels);rgb=denoise(pixels.reshape(size,size,4)[:,:,:3]);rgb=smooth_irradiance(rgb) if group=='walls' else rgb;scale=max(1,math.ceil(float(np.percentile(rgb,99.98))*4)/4);path=OUT/(OUTPUT_STEM+'-'+group+'-light.png');png(path,np.clip(rgb/scale,0,1))
 mats=[]
 for old in obj.data.materials:
  spec=specs[old.name];kind=spec[1];tint=spec[2];name=('LIGHTMAP '+STEM+' '+group) if group in {'walls','cap'} else ('SURFACE '+STEM+' '+kind+' '+str(len(mats)))
  mat=surface_material(name,path,'LightUV',scale,spec);mats.append(mat)
  if old.get('wallDetailsOnly'):mat['wallDetailsOnly']=True
  report['surfaces'].append({'name':name,'kind':kind,'colorLinear':tint,'periodMeters':spec[3],'roughness':spec[4],'normalStrength':spec[5]})
 deliveries.append((obj,mats));report['atlases'].append({'group':group,'size':size,'radianceScale':scale,'path':'/museum/contemporary/'+path.name})
# Defer material replacement until all bakes finish: preserve physically correct GI.
for obj,mats in deliveries:
 unique=[];lookup={};remap={}
 for i,mat in enumerate(mats):
  keymat=tuple(sorted((k,json.dumps(v.to_list() if hasattr(v,'to_list') else v)) for k,v in mat.items()))
  if keymat not in lookup:lookup[keymat]=len(unique);unique.append(mat)
  remap[i]=lookup[keymat]
 indices=[remap[p.material_index] for p in obj.data.polygons]
 obj.data.materials.clear()
 for mat in unique:obj.data.materials.append(mat)
 for p,i in zip(obj.data.polygons,indices):p.material_index=i
 obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
# Keep bevels sampling their own adjacent planar top, preventing subtexel black specks.
floor=baked['floor'];mesh=floor.data;uv=mesh.uv_layers['LightUV']
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

report['wallEdgeUV']=protect_thin_wall_uv(baked['walls'])
report['mortarUV']=repair_mortar_irradiance(floor)
report['floorBevelUV']={'tileCount':tiles,'retargetedFaces':faces,'retargetedLoops':loops,'insetMeters':inset}
# Export the terminal closure separately with the new closed-interior lighting.
if cap:
 select([cap]);bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/museum/end-cap-contemporary.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=90,export_vertex_color='NONE',export_draco_mesh_compression_enable=True,export_draco_position_quantization=20,export_draco_texcoord_quantization=16)
 cap.hide_render=True;cap.hide_set(True)
objects=[o for o in scene.objects if o!=cap and not o.get('interiorShadowOnly') and o.type in {'MESH','EMPTY'}];select(objects)
path=ROOT/'public/museum'/(OUTPUT_STEM+'-contemporary.glb')
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=90,export_vertex_color='NONE',export_texcoords=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
bpy.ops.wm.save_as_mainfile(filepath=str(PRIVATE/(OUTPUT_STEM+'-contemporary.blend')))
report['bytes']=path.stat().st_size;report['seconds']=time.time()-START;(OUT/(OUTPUT_STEM+'-report.json')).write_text(json.dumps(report,indent=2));log('INTERIOR_FINISHED',json.dumps(report))
