"""Original procedural architecture. Run Blender --background --python this_file.

All authored coordinates are runtime metres (X, Y-up, Z). blender_pos() alone
converts them to Blender. glTF export reverses that conversion, including anchors.
Materials are standard Principled PBR with explicit base colors, no baking
of paintings, lettering or illumination. --render optionally writes composition.
"""
import bpy, bmesh, json, math, random, sys, struct, zlib
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
CFG = json.loads((Path(__file__).with_name('museum_config.json')).read_text())
OUT = ROOT / 'public/museum'
PRIVATE = ROOT / 'assets/museum'
OUT.mkdir(parents=True, exist_ok=True)
PRIVATE.mkdir(parents=True, exist_ok=True)
random.seed(2418)
MODULE_BOUNDS=[]

def xyz(p): return (p[0], -p[2], p[1])

def write_png(path, pixels):
    """Minimal deterministic RGB PNG writer, no imaging package dependency."""
    h,w,_=pixels.shape
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    raw=b''.join(b'\x00'+row.tobytes() for row in pixels.astype(np.uint8))
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))

def generated_texture(mat, color, surface):
    """Original tileable albedo and micro-normal maps, explicitly exported to glTF."""
    n=512; yy,xx=np.mgrid[0:n,0:n]/n
    rng=np.random.default_rng(621)
    cloud=np.zeros((n,n))
    ky=np.fft.fftfreq(n)[:,None];kx=np.fft.fftfreq(n)[None,:]
    for scale,weight in [(40,.50),(15,.26),(6,.14),(2,.10)]:
        field=np.fft.ifft2(np.fft.fft2(rng.normal(0,1,(n,n)))*np.exp(-(kx*kx+ky*ky)*scale*scale*8)).real
        cloud+=weight*field/(field.std()+1e-7)
    grain=rng.normal(0,1,(n,n))
    if surface=='wood':
        rings=np.sin(yy*math.tau*23+cloud*1.5+np.sin(xx*math.tau*3)*.8)
        field=.18*cloud+.11*rings+.02*grain
        height=.12*rings+.03*grain
    elif surface=='linen':
        weave=np.sin(xx*math.tau*64)*np.sin(yy*math.tau*64)
        field=.045*grain+.10*weave+.035*cloud
        height=.17*grain+.23*weave
    elif surface=='floor':
        vein=np.sin(math.tau*(xx*2+yy*4)+cloud*1.4)
        pores=np.maximum(0,grain-1.65)
        field=.12*cloud+.020*grain-.09*np.maximum(0,vein-.40)-.07*pores
        height=.035*cloud+.045*pores
    else:
        pores=np.maximum(0,grain-1.5)
        field=.062*cloud+.022*grain-.055*pores
        height=.09*cloud+.11*pores
    # PNG colors are sRGB; material inputs are linear. No warm lighting baked in.
    linear=np.clip(np.array(color)[None,None,:]*(1+field[:,:,None]),0,1)
    rgb=np.where(linear<=.0031308,linear*12.92,1.055*np.power(linear,1/2.4)-.055)
    folder=OUT/'textures';folder.mkdir(exist_ok=True)
    slug=mat.name.lower().replace(' ','-')
    path=folder/(slug+'-albedo.png');write_png(path,np.clip(rgb*255,0,255))
    img=bpy.data.images.load(str(path),check_existing=True);img.pack()
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;b=nodes.get('Principled BSDF')
    tex=nodes.new('ShaderNodeTexImage');tex.name='Exported original '+surface;tex.image=img
    links.new(tex.outputs['Color'],b.inputs['Base Color'])
    # Shared map per physical surface type. OpenGL +Y normal convention.
    normal_path=folder/(surface+'-normal.png')
    if True:
        dx=(np.roll(height,-1,1)-np.roll(height,1,1))*.55
        dy=(np.roll(height,-1,0)-np.roll(height,1,0))*.55
        normals=np.dstack((-dx,-dy,np.ones((n,n))));normals/=np.linalg.norm(normals,axis=2)[:,:,None]
        write_png(normal_path,(normals*.5+.5)*255)
    ni=bpy.data.images.load(str(normal_path),check_existing=True);ni.colorspace_settings.name='Non-Color';ni.pack()
    nt=nodes.new('ShaderNodeTexImage');nt.image=ni
    nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.85 if surface=='linen' else .55
    links.new(nt.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],b.inputs['Normal'])
    if surface=='floor':
        rough_path=folder/'floor-roughness.png'
        rough=np.clip(.26+.07*cloud+.025*grain,.15,.44)
        write_png(rough_path,np.repeat((rough*255)[:,:,None],3,axis=2))
        ri=bpy.data.images.load(str(rough_path),check_existing=True);ri.colorspace_settings.name='Non-Color';ri.pack()
        rt=nodes.new('ShaderNodeTexImage');rt.image=ri;links.new(rt.outputs['Color'],b.inputs['Roughness'])

def material(name, color, rough=.7, metal=0, surface=None):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*color,1)
    b.inputs['Roughness'].default_value=rough
    b.inputs['Metallic'].default_value=metal
    if surface:generated_texture(m,color,surface)
    return m

def box(name, pos, size, mat, bevel=0):
    x,y,z=pos;w,h,d=(v/2 for v in size)
    o=mesh(name,[(x-w,y-h,z-d),(x+w,y-h,z-d),(x+w,y+h,z-d),(x-w,y+h,z-d),(x-w,y-h,z+d),(x+w,y-h,z+d),(x+w,y+h,z+d),(x-w,y+h,z+d)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
    if bevel:
        b=o.modifiers.new('Soft stone edges','BEVEL'); b.width=bevel; b.segments=10 if mat.name=='Natural linen' else 2
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=b.name)
        if mat.name=='Natural linen':
            for polygon in o.data.polygons:polygon.use_smooth=True
            normal=o.modifiers.new('Soft cushion normals','WEIGHTED_NORMAL');normal.keep_sharp=True
            bpy.ops.object.modifier_apply(modifier=normal.name)
    return o

def mesh(name, verts, faces, mat):
    m=bpy.data.meshes.new(name); m.from_pydata([xyz(v) for v in verts],[],faces); m.update()
    o=bpy.data.objects.new(name,m); bpy.context.collection.objects.link(o); o.data.materials.append(mat)
    return o

def beam(name,a,b,r,mat,vertices=10):
    aa=Vector(xyz(a)); bb=Vector(xyz(b)); d=bb-aa
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(aa+bb)/2)
    o=bpy.context.object; o.name=name; o.rotation_euler=d.to_track_quat('Z','Y').to_euler(); o.data.materials.append(mat)
    return o

def cylinder(name,pos,radius,depth,mat,top=None):
    bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=radius,radius2=top if top is not None else radius,depth=depth,location=xyz(pos))
    o=bpy.context.object; o.name=name; o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth=len(p.vertices)==4
    return o

def arc(name,center,rx,ry,thickness,depth,mat,plane='xy',segments=64):
    verts=[]
    def point(u,v,w):
        return (center[0]+u,center[1]+v,center[2]+w) if plane=='xy' else (center[0]+w,center[1]+v,center[2]+u)
    for i in range(segments+1):
        a=i*math.pi/segments
        for outer,w in [(0,-depth/2),(1,-depth/2),(0,depth/2),(1,depth/2)]:
            verts.append(point((rx+outer*thickness)*math.cos(a),(ry+outer*thickness)*math.sin(a),w))
    faces=[]
    for i in range(segments):
        a=i*4;b=a+4
        faces.extend([(a,b,b+1,a+1),(a+2,a+3,b+3,b+2),(a,a+2,b+2,b),(a+1,b+1,b+3,a+3)])
    faces.extend([(0,1,3,2),(segments*4,segments*4+2,segments*4+3,segments*4+1)])
    return mesh(name,verts,faces,mat)

def lathe(name,x,z,profile,mat,segments=48,flutes=False):
    verts=[];faces=[]
    for y,r in profile:
        for i in range(segments):
            a=math.tau*i/segments
            rr=r-(.014*(.5+.5*math.cos(a*16)) if flutes and .6<y<5.8 else 0)
            verts.append((x+rr*math.cos(a),y,z+rr*math.sin(a)))
    for j in range(len(profile)-1):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    faces.append(tuple(range(segments-1,-1,-1)))
    faces.append(tuple((len(profile)-1)*segments+i for i in range(segments)))
    o=mesh(name,verts,faces,mat)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return o

def tube_path(name,points,radii,mat,sides=7):
    vv=[];ff=[]
    for i,p in enumerate(points):
        p=Vector(p); tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        tangent.normalize();u=tangent.cross(Vector((0,1,0)))
        if u.length<.01:u=tangent.cross(Vector((1,0,0)))
        u.normalize();v=tangent.cross(u).normalized()
        for k in range(sides):vv.append(tuple(p+radii[i]*(math.cos(k*math.tau/sides)*u+math.sin(k*math.tau/sides)*v)))
    for j in range(len(points)-1):
        for k in range(sides):a=j*sides+k;b=j*sides+(k+1)%sides;ff.append((a,b,b+sides,a+sides))
    o=mesh(name,vv,ff,mat)
    for p in o.data.polygons:p.use_smooth=True
    return o

def cushion(x,z):
    # Superellipsoid: truly rounded upholstery, gently domed top and tucked sides.
    vv=[];ff=[];rings=16;segments=64
    for j in range(rings+1):
        v=-math.pi/2+math.pi*j/rings
        for i in range(segments):
            u=math.tau*i/segments
            power=lambda a,p:math.copysign(abs(a)**p,a)
            vv.append((x+1.30*power(math.cos(v),.48)*power(math.cos(u),.40),.59+.20*power(math.sin(v),.68),z+.50*power(math.cos(v),.48)*power(math.sin(u),.40)))
    for j in range(rings):
        for i in range(segments):a=j*segments+i;b=j*segments+(i+1)%segments;ff.append((a,b,b+segments,a+segments))
    o=mesh('Hand upholstered bench',vv,ff,LINEN)
    for p in o.data.polygons:p.use_smooth=True
    # Welt seam following the rounded upholstery perimeter.
    points=[]
    for i in range(65):
        a=math.tau*i/64
        points.append((x+1.295*math.copysign(abs(math.cos(a))**.40,math.cos(a)),.575,z+.495*math.copysign(abs(math.sin(a))**.40,math.sin(a))))
    tube_path('Upholstery welt seam',points,[.008]*len(points),LINEN_EDGE,5)

def portal_wall(name, axis, fixed, lo, hi, center,r,spring,mat,height=5.65,depth=.3,face_offset=0):
    # Thick jambs, top lintel, and curved spandrels. The opening is real geometry.
    def p(u,y,d=0): return (u,y,fixed+d) if axis=='z' else (fixed+d,y,u)
    def sz(w,h,d): return (w,h,d) if axis=='z' else (d,h,w)
    for a,b in [(lo,center-r),(center+r,hi)]:
        box(name+' jamb',p((a+b)/2,height/2),sz(b-a,height,depth),mat,.035)
    box(name+' crown',p(center,(spring+r+height)/2),sz(2*r,max(.03,height-spring-r),depth),mat)
    # Slice the stone above the circular opening and below its crown.
    for i in range(24):
        u1=-r+2*r*i/24;u2=-r+2*r*(i+1)/24
        y1=spring+math.sqrt(max(0,r*r-u1*u1));y2=spring+math.sqrt(max(0,r*r-u2*u2))
        v=[p(center+u1,y1,-depth/2),p(center+u2,y2,-depth/2),p(center+u2,spring+r,-depth/2),p(center+u1,spring+r,-depth/2),p(center+u1,y1,depth/2),p(center+u2,y2,depth/2),p(center+u2,spring+r,depth/2),p(center+u1,spring+r,depth/2)]
        mesh(name+' spandrel',v,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat)
    c=(center,spring,fixed+face_offset) if axis=='z' else (fixed+face_offset,spring,center)
    arc(name+' soft plaster arch',c,r,r,.18,depth+.08,TRIM,'xy' if axis=='z' else 'zy')
    # Offset the trim's inside face from the masonry jamb: exact coincidence
    # produced a dark vertical artefact in the actual composition render.
    for u in [center-r-.15,center+r+.15]:
        box(name+' reveal',p(u,spring/2,face_offset),sz(.26,spring,depth+.08),TRIM,.06)

def tree(x,z):
    # Turned mineral planter with shaped foot, belly and rolled rim.
    lathe('Hand turned travertine urn',x,z,[(.02,.37),(.07,.42),(.10,.40),(.14,.43),(.24,.47),(.55,.53),(.77,.57),(.81,.58),(.83,.60),(.87,.60),(.90,.57)],PLANTER,64)
    cylinder('Earth',(x,.865,z),.545,.025,EARTH)
    trunk=[(x,.87,z),(x-.035,1.2,z+.02),(x+.035,1.7,z-.01),(x+.015,2.2,z+.045),(x+.09,2.65,z)]
    tube_path('Natural tapered olive trunk',trunk,[.066,.061,.047,.031,.012],WOOD,10)
    leaf_vertices=[[],[],[]];leaf_faces=[[],[],[]]
    for j in range(28):
        angle=j*2.399;h=1.48+j*.047;reach=.30+(j%5)*.062
        start=Vector((x+.02,h,z));end=Vector((x+math.cos(angle)*reach,h+.42+random.random()*.20,z+math.sin(angle)*reach))
        middle=start.lerp(end,.52)+Vector((0,.11,0))
        tube_path('Tapered olive branch',[tuple(start),tuple(middle),tuple(end)],[.023,.014,.003],WOOD,6)
        for twig in range(4):
            t=.36+twig*.19;origin=start.lerp(end,t)
            a=angle+(twig%2*2-1)*.85
            tip=origin+Vector((math.cos(a)*.22,.15+random.random()*.12,math.sin(a)*.22))
            tube_path('Olive fine shoot',[tuple(origin),tuple(origin.lerp(tip,.55)+Vector((0,.045,0))),tuple(tip)],[.0045,.003,.0008],WOOD,5)
            for leaf in range(10):
                t=.13+leaf*.081;center=origin.lerp(tip,t)
                a2=a+(1 if leaf%2 else -1)*1.20
                direction=Vector((math.cos(a2),random.uniform(-.20,.50),math.sin(a2))).normalized()
                cross=direction.cross(Vector((0,1,0))).normalized()
                length=random.uniform(.095,.155);width=random.uniform(.017,.027)
                idx=(j+leaf)%3;vv=leaf_vertices[idx];ff=leaf_faces[idx];base=len(vv)
                # 5 curved lanceolate stations, narrow ridge and gently bent tip.
                for station in range(5):
                    u=station/4;w=math.sin(math.pi*u)**.78*width
                    spine=center+direction*(u*length)+Vector((0,math.sin(math.pi*u)*.012-u*u*.017,0))
                    for side in [-1,0,1]:vv.append(tuple(spine+cross*w*side+Vector((0,.005*(1-abs(side)),0))))
                for station in range(4):
                    v=base+station*3;ff.extend([(v,v+1,v+4,v+3),(v+1,v+2,v+5,v+4)])
    for i in range(3):
        o=mesh('Curved olive leaves',leaf_vertices[i],leaf_faces[i],LEAVES[i])
        for p in o.data.polygons:p.use_smooth=True

def exterior_branches():
    vv=[[],[],[]];ff=[[],[],[]]
    for j in range(7):
        z=-12+j*3.7
        start=Vector((-9.1,8.15,z));end=Vector((-5.5+random.random()*.4,8.8+random.random()*.5,z+1.1))
        tube_path('Exterior olive bough',[tuple(start),tuple(start.lerp(end,.48)+Vector((0,.2,0))),tuple(end)],[.07,.045,.013],WOOD,8)
        for k in range(12):
            p=start.lerp(end,.15+k*.07);sgn=1 if k%2 else -1
            tip=p+Vector((.2+random.random()*.4,.1+random.random()*.23,sgn*(.50+random.random()*.32)))
            tube_path('Exterior olive twig',[tuple(p),tuple(p.lerp(tip,.5)+Vector((0,.08,0))),tuple(tip)],[.012,.006,.001],WOOD,6)
            for l in range(12):
                center=p.lerp(tip,.10+l*.073);angle=(1 if l%2 else -1)*.9
                direction=(tip-p).normalized();direction=Vector((direction.x*math.cos(angle)-direction.z*math.sin(angle),-.12,direction.x*math.sin(angle)+direction.z*math.cos(angle))).normalized()
                cross=direction.cross(Vector((0,1,0))).normalized();idx=(l+k)%3;base=len(vv[idx]);length=.15+random.random()*.10
                for station in range(5):
                    u=station/4;w=math.sin(math.pi*u)*.033
                    spine=center+direction*u*length+Vector((0,.014*math.sin(math.pi*u),0))
                    for side in [-1,0,1]:vv[idx].append(tuple(spine+cross*w*side+Vector((0,.007*(1-abs(side)),0))))
                for station in range(4):
                    a=base+station*3;ff[idx].extend([(a,a+1,a+4,a+3),(a+1,a+2,a+5,a+4)])
    for i in range(3):
        o=mesh('Exterior olive leaves',vv[i],ff[i],LEAVES[i])
        for p in o.data.polygons:p.use_smooth=True

def bake_vertex_ao():
    """Static short-range geometry occlusion, no directional light or art baked."""
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    vertices=[];faces=[]
    for o in objects:
        if o.data.materials[0] in LEAVES or o.data.materials[0] in [GLASS,LAMP]:continue
        offset=len(vertices);vertices.extend(o.matrix_world@v.co for v in o.data.vertices)
        faces.extend(tuple(offset+i for i in p.vertices) for p in o.data.polygons)
    tree=BVHTree.FromPolygons(vertices,faces,all_triangles=False)
    rays=[]
    for i in range(12):
        r=math.sqrt((i+.5)/12);a=i*2.399963
        rays.append(Vector((r*math.cos(a),r*math.sin(a),math.sqrt(1-r*r))))
    cache={};point_count=0
    for o in objects:
        mat=o.data.materials[0]
        colors=o.data.color_attributes.new(name='AmbientOcclusion',type='BYTE_COLOR',domain='CORNER')
        o.data.color_attributes.active_color=colors
        neutral=mat in [GLASS,LAMP,BRASS,SKYMETAL] or mat in LEAVES or mat==WOOD
        for p in o.data.polygons:
            n=(o.matrix_world.to_3x3()@p.normal).normalized()
            for li in p.loop_indices:
                if neutral:factor=1.0
                else:
                    position=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co
                    key=tuple(round(float(v),2) for v in position)+tuple(round(float(v),1) for v in n)
                    if key in cache:factor=cache[key]
                    else:
                        tangent=n.cross(Vector((0,0,1)))
                        if tangent.length<.1:tangent=n.cross(Vector((1,0,0)))
                        tangent.normalize();bitangent=n.cross(tangent)
                        occluded=0;start=position+n*.022
                        for ray in rays:
                            direction=tangent*ray.x+bitangent*ray.y+n*ray.z
                            hit=tree.ray_cast(start,direction,1.7)
                            if hit[0] is not None:occluded+=max(0,1-hit[3]/1.7)**.5
                        factor=1-.68*occluded/len(rays);cache[key]=factor;point_count+=1
                colors.data[li].color=(factor,factor,factor,1)
    print('VERTEX_AO_BAKED',point_count,flush=True)

# V2: two genuinely different Mediterranean rooms in the shared 12 x 18m frame.
PROXIES=[]

def proxy(kind,center,size):
    PROXIES.append({'kind':kind,'min':[center[i]-size[i]/2 for i in range(3)],'max':[center[i]+size[i]/2 for i in range(3)]})

def wood_bench(x,z,books=False):
    box('Solid walnut bench frame',(x,.42,z),(2.25,.13,.90),DARKWOOD,.035)
    box('Linen bench cushion',(x,.62,z),(2.16,.30,.84),LINEN,.145)
    for dx in [-.88,.88]:box('Walnut trestle leg',(x+dx,.21,z),(.15,.40,.66),DARKWOOD,.022)
    if books:
        for i,offset in enumerate([0,.025,-.015]):
            box('Unlabelled art book cover',(x+.65+offset,.805+i*.055,z),(.47,.025,.34),BOOKS[i],.006)
            box('Book paper block',(x+.65+offset,.827+i*.055,z),(.445,.031,.317),PAPER,.003)
        lathe('Small ceramic bowl',x-.58,z,[(.78,.11),(.80,.13),(.84,.20),(.89,.23),(.90,.235),(.915,.23),(.91,.20),(.855,.165),(.825,.08)],CERAMIC,40)
    proxy('bench',(x,.49,z),(2.30,.98,.94))

def rug(x,z,w,d):
    box('Handwoven jute rug',(x,.028,z),(w,.025,d),RUG,.016)
    for s in [-1,1]:
        box('Woven rug border',(x,.044,z+s*(d/2-.11)),(w-.08,.005,.065),RUG_BORDER)
        for j in range(int(w/.055)):
            u=x-w/2+.02+j*.055
            beam('Jute fringe',(u,.031,z+s*d/2),(u+random.uniform(-.018,.018),.032,z+s*(d/2+.11)),.0055,RUG,5)

def vase(name,x,y,z,r=.25,h=.65,mat=None):
    return lathe(name,x,z,[(y,r*.56),(y+.03,r*.62),(y+h*.15,r*.85),(y+h*.48,r),(y+h*.72,r*.85),(y+h*.86,r*.46),(y+h*.96,r*.44),(y+h,r*.50),(y+h+.016,r*.48),(y+h-.03,r*.34)],mat or CERAMIC,48)

def abstract_sculpture(x,y,z):
    # Original interlocking limestone form, explicitly decorative, no artist attribution.
    lathe('Sculpture oval base',x,z,[(y,.18),(y+.06,.22),(y+.13,.21)],SCULPTURE,48)
    points=[]
    for i in range(41):
        a=math.tau*i/40
        points.append((x+.21*math.sin(a),y+.54+.40*math.cos(a),z+.11*math.sin(a*2)))
    tube_path('Original folded stone sculpture',points,[.10+.02*math.sin(i*.45) for i in range(41)],SCULPTURE,12)

def console_corner(x,z):
    box('Walnut console top',(x,.88,z),(.72,.11,1.15),DARKWOOD,.035)
    for dz in [-.46,.46]:box('Walnut console support',(x,.43,z+dz),(.57,.80,.11),DARKWOOD,.022)
    abstract_sculpture(x,.95,z-.21)
    vase('Glazed ochre vase',x,.945,z+.36,.15,.47,CERAMIC_DARK)
    proxy('console-sculpture',(x,1.025,z),(.78,2.05,1.22))

def room_plant(x,z,scale=.90):
    before=set(bpy.context.scene.objects)
    tree(x,z)
    bpy.context.view_layer.update()
    for o in set(bpy.context.scene.objects)-before:
        inverse=o.matrix_world.inverted()
        for v in o.data.vertices:
            p=o.matrix_world@v.co;origin=Vector(xyz((x,0,z)));v.co=inverse@(origin+(p-origin)*scale)
    proxy('plant',(x,1.85*scale,z),(1.6*scale,3.7*scale,1.6*scale))

def vault_strip(x1,x2,z1,z2):
    vv=[];ff=[];steps=max(8,int((x2-x1)*8))
    for i in range(steps+1):
        x=x1+(x2-x1)*i/steps;y=5.30+1.30*math.sqrt(max(0,1-(x/6.15)**2))
        vv.extend([(x,y,z1),(x,y,z2),(x,y+.14,z1),(x,y+.14,z2)])
    for i in range(steps):
        a=i*4;b=a+4;ff.extend([(a,a+1,b+1,b),(a+2,b+2,b+3,a+3),(a,a+2,b+2,b),(a+1,b+1,b+3,a+3)])
    ff.extend([(0,2,3,1),(steps*4,steps*4+1,steps*4+3,steps*4+2)])
    o=mesh('Soft plaster barrel vault',vv,ff,TRIM)
    for p in o.data.polygons:p.use_smooth=True

def ceiling(salon):
    if not salon:
        vault_strip(-6.1,-2.15,-9,9);vault_strip(2.15,6.1,-9,9)
        vault_strip(-2.15,2.15,-9,-5.5);vault_strip(-2.15,2.15,5.7,9)
        for z in [-8.7,-5.5,5.7,8.7]:arc('Vault plaster rib',(0,5.30,z),6.06,1.30,.14,.26,TRIM)
        for x in [-2.15,2.15]:box('Skylight deep plaster reveal',(x,6.48,.10),(.20,.20,11.3),TRIM,.065)
        for z in [-5.5,-1.75,2.0,5.7]:box('Warm timber skylight beam',(0,6.56,z),(4.3,.14,.10),DARKWOOD,.016)
        for iz in range(3):box('Skylight glass',(0,6.59,-3.63+iz*3.72),(4.12,.008,3.60),GLASS)
    else:
        # Lower, intimate salon with a central opening and solid warm timber rafters.
        for x in [-3.9,3.9]:box('Salon plaster ceiling',(x,5.75,0),(4.3,.22,18),TRIM,.045)
        for z in [-6.55,6.55]:box('Salon plaster ceiling end',(0,5.75,z),(3.5,.22,4.9),TRIM,.045)
        for z in [-7.8,-3.9,0,3.9,7.8]:box('Exposed walnut rafter',(0,5.53,z),(12,.26,.16),DARKWOOD,.025)
        for x in [-1.75,1.75]:box('Salon skylight curb',(x,5.67,0),(.17,.27,8.1),DARKWOOD,.02)
        for z in [-2,2]:box('Salon skylight glass',(0,5.80,z),(3.35,.01,3.86),GLASS)
        for side in [-1,1]:
            box('Indirect lighting cove',(side*5.72,5.17,0),(.24,.14,18),TRIM,.055)
            box('Indirect cove diffuser',(side*5.76,5.22,0),(.07,.015,18),LAMP)

def main_room(salon=False):
    global STONE,TRIM,PROXIES
    STONE=SALON_PLASTER if salon else HALL_PLASTER;TRIM=SALON_TRIM if salon else HALL_TRIM;PROXIES=[]
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    box('Foundation',(0,-.16,0),(12.25,.30,18.25),GROUT)
    step=.75 if salon else 1.0;cols=16 if salon else 12
    for row in range(int(18/step)):
        for col in range(cols+1):
            start=max(-6,-6+col*step-(step/2 if row%2 else 0));end=min(6,-6+(col+1)*step-(step/2 if row%2 else 0))
            if end<=start:continue
            mat=(TERRA_FLOORS if salon else FLOORS)[(row+col*3)%4]
            box('Hand laid warm floor',((start+end)/2,-.006,-9+(row+.5)*step),(end-start-.004,.025,step-.004),mat,.0015)
    for side in [-1,1]:
        portal_wall('Side alcove portal','x',side*6,-9,9,-6.5,1.3,3.5,STONE,5.67)
        for a,b in [(-9,-7.8),(-5.2,9)]:
            box('Low continuous stone plinth',(side*5.89,.22,(a+b)/2),(.14,.44,b-a),BASE,.035)
            box('Plaster cove at spring',(side*5.85,5.15,(a+b)/2),(.28,.17,b-a),TRIM,.075)
        # Tall, quiet arched plaster recesses; artwork locations stay independent.
        for z in [6,2,-1.5]:arc('Plaster artwork bay',(side*5.86,4.05,z),1.42,1.03,.115,.16,TRIM,'zy')
        for z in [4.1,-.05,-3.0]:
            box('Rounded engaged plaster pier',(side*5.84,2.58,z),(.31,5.15,.34),TRIM,.125)
            proxy('pier',(side*5.84,2.58,z),(.35,5.18,.39))
        # Both editorial alcoves are complete rooms with ceilings and dressed corners.
        box('Alcove floor',(side*8,-.055,-6.5),(4,.10,5),FLOORS[1])
        box('Editorial plaster wall',(side*10,2.8,-6.5),(.3,5.6,5),STONE,.065)
        for z in [-9,-4]:box('Alcove return wall',(side*8,2.8,z),(4,5.6,.3),STONE,.06)
        box('Alcove vaulted cap',(side*8,5.52,-6.5),(4,.25,5),TRIM,.08)
        box('Alcove built-in seat',(side*8.2,.37,-8.52),(2.25,.74,.60),TRIM,.10)
        proxy('alcove-seat',(side*8.2,.37,-8.52),(2.3,.78,.64))
        vase('Alcove large earthen vessel',side*9.05,0,-4.82,.34,.91,CERAMIC_DARK)
        proxy('vase',(side*9.05,.48,-4.82),(.76,.96,.76))
        box('Alcove wood shelf',(side*9.73,1.1,-6.5),(.36,.08,2.2),DARKWOOD,.025)
        proxy('editorial-shelf',(side*9.73,1.1,-6.5),(.42,.15,2.25))
    # End walls each own half the shared 30cm interface, avoiding coplanar
    # materials when two real rooms are rendered together.
    portal_wall('Entrance portal','z',8.925,-6,6,0,1.6,3.8,STONE,5.8 if salon else 6.6,.15,-.065)
    if salon:portal_wall('Connecting portal','z',-8.925,-6,6,0,1.6,3.8,STONE,5.8,.15,.065)
    else:
        box('Gallery end wall',(0,3.3,-9),(12,6.6,.3),STONE,.045)
        for x in [-3.5,0,3.5]:arc('End plaster bay',(x,4.0,-8.81),1.43,1.39,.14,.19,TRIM)
        for x in [-1.72,1.72]:box('End wall soft pier',(x,2.58,-8.84),(.28,5.15,.24),TRIM,.09)
    ceiling(salon)
    for x in [-2.9,2.9]:
        rug(x,4.25,2.65,1.50)
        wood_bench(x,4.25,books=(x<0 or salon))
    for x in [-5,5]:room_plant(x,4.1,.9)
    for x in [-5,5]:room_plant(x,-8,.78)
    console_corner(5.15,7.9)
    # Grounded stone composition in the opposite entrance corner, visible on return.
    box('Sculpture plinth',(-5.0,.45,7.9),(.68,.90,.68),BASE,.055)
    abstract_sculpture(-5.0,.94,7.9)
    proxy('sculpture',(-5.0,1.02,7.9),(.78,2.05,.78))
    if salon:
        vase('Salon floor vessel',-5.07,0,.3,.28,.75,CERAMIC_DARK)
        proxy('vase',(-5.07,.40,.3),(.62,.80,.62))
    return list(PROXIES)

def outdoor():
    global STONE,TRIM,PROXIES
    STONE=HALL_PLASTER;TRIM=HALL_TRIM;PROXIES=[]
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    box('Terrace stone foundation',(0,-.22,4.5),(20,.42,9),BASE,.10)
    for x in range(-10,10):
        for z in range(9):box('Terrace stone slab',(x+.5,-.01,z+.5),(.995,.035,.995),FLOORS[(x+z)%4],.003)
    for side in [-1,1]:
        box('Terrace low parapet',(side*9.4,.42,4.5),(.48,.84,9),HALL_PLASTER,.13)
        for z in [1.5,6.8]:room_plant(side*7.7,z,1.15)
        wood_bench(side*5.3,5.0,False)
        vase('Terrace amphora',side*8.5,0,7.9,.42,1.2,CERAMIC_DARK)
        # Low sculpted cliffs frame the sea without closing the view.
        vv=[];ff=[]
        for i in range(20):
            z=8+i*1.4
            for j in range(6):
                x=side*(8+j*2);h=max(-1.2,1.5*math.sin(i*.42)+.7*math.cos(j*.91+i*.55)-j*.28)
                vv.append((x,h,z))
        for i in range(19):
            for j in range(5):a=i*6+j;ff.append((a,a+1,a+7,a+6))
        o=mesh('Sculpted coastal limestone',vv,ff,ROCK)
        for p in o.data.polygons:p.use_smooth=True
    for z in [9.05,9.55]:box('Terrace sea steps',(0,-.20-(z-9)*.4,z),(7,.22,.55),BASE,.065)
    # A low original island outline, beyond the terrace and above the runtime sea.
    vv=[(0,4.5,55)];rings=16;segments=64
    for ring in range(1,rings+1):
        r=ring/rings
        for i in range(segments):
            a=math.tau*i/segments;x=math.cos(a)*15*r;z=55+math.sin(a)*7*r
            height=(1-r*r)**1.3*(5+.9*math.sin(a*3)+.8*math.cos(a*5))-.7
            vv.append((x,height,z))
    ff=[]
    for i in range(segments):ff.append((0,1+i,1+(i+1)%segments))
    for ring in range(rings-1):
        for i in range(segments):a=1+ring*segments+i;b=1+ring*segments+(i+1)%segments;ff.append((a,b,b+segments,a+segments))
    o=mesh('Distant Mediterranean island',vv,ff,DISTANT_ROCK)
    for p in o.data.polygons:p.use_smooth=True
    return list(PROXIES)

def prepare_and_export(stem,anchors):
    print('GEOMETRY_READY',stem,len(bpy.context.scene.objects),flush=True)
    for o in bpy.context.scene.objects:
        if o.type!='MESH':continue
        bm=bmesh.new();bm.from_mesh(o.data)
        if any(word in o.name.lower() for word in ['wall','jamb','crown','vault','ceiling']):
            long_edges=[e for e in bm.edges if e.calc_length()>1.2]
            if long_edges:
                length=max(e.calc_length() for e in long_edges)
                bmesh.ops.subdivide_edges(bm,edges=long_edges,cuts=min(15,max(1,int(length/.85))),use_grid_fill=True)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
        scale=1/.22 if o.data.materials[0] in [LINEN,RUG] else .25
        uv=o.data.uv_layers.active or o.data.uv_layers.new(name='MetricUV')
        for poly in o.data.polygons:
            normal=o.matrix_world.to_3x3()@poly.normal;axis=max(range(3),key=lambda i:abs(normal[i]));axes=(1,2) if axis==0 else ((0,2) if axis==1 else (0,1))
            for li in poly.loop_indices:
                p=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(p[axes[0]]*scale,p[axes[1]]*scale)
    bpy.context.view_layer.update();bake_vertex_ao()
    for mat in list(bpy.data.materials):
        objs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0]==mat]
        if not objs:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:o.select_set(True)
        bpy.context.view_layer.objects.active=objs[0]
        if len(objs)>1:bpy.ops.object.join()
        objs[0].name='Architecture · '+mat.name
    for name,p in anchors.items():
        o=bpy.data.objects.new('anchor_'+name,None);bpy.context.collection.objects.link(o);o.location=xyz(p);o['runtimePosition']=list(p)
    points=[o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices]
    positions=[(p.x,p.z,-p.y) for p in points]
    bounds={'min':[min(p[i] for p in positions) for i in range(3)],'max':[max(p[i] for p in positions) for i in range(3)]}
    bpy.ops.wm.save_as_mainfile(filepath=str(PRIVATE/(stem+'.blend')))
    args=dict(export_format='GLB',export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_vertex_color='ACTIVE',export_all_vertex_colors=False)
    bpy.ops.export_scene.gltf(filepath=str(PRIVATE/(stem+'-uncompressed.glb')),**args)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(stem+'.glb')),export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16,export_draco_normal_quantization=12,export_draco_texcoord_quantization=14,export_draco_color_quantization=8,**args)
    print('MODULE_EXPORTED',stem,(OUT/(stem+'.glb')).stat().st_size,flush=True)
    return bounds

HALL_PLASTER=material('Sand lime plaster',(.76,.63,.45),.93,surface='stone')
HALL_TRIM=material('Warm vaulted plaster',(.82,.70,.53),.89,surface='stone')
SALON_PLASTER=material('Salon earth plaster',(.58,.41,.28),.93,surface='stone')
SALON_TRIM=material('Salon cove plaster',(.71,.54,.38),.90,surface='stone')
STONE=HALL_PLASTER;TRIM=HALL_TRIM
BASE=material('Warm travertine base',(.51,.39,.25),.65,surface='stone')
GROUT=material('Fine warm mortar',(.52,.42,.30),.86)
FLOORS=[material('Sand travertine '+str(i),(.48+i*.018,.365+i*.015,.23+i*.012),.28,surface='floor') for i in range(4)]
TERRA_FLOORS=[material('Salon clay floor '+str(i),(.36+i*.02,.20+i*.013,.115+i*.009),.35,surface='floor') for i in range(4)]
BRASS=material('Aged warm brass',(.50,.30,.08),.28,.72)
SKYMETAL=material('Warm bronze skylight',(.26,.18,.095),.40,.4)
DARKWOOD=material('Natural walnut grain',(.22,.105,.035),.52,surface='wood')
LINEN=material('Natural linen',(.65,.52,.34),.98,surface='linen')
LINEN_EDGE=material('Linen welt cord',(.43,.32,.20),1)
RUG=material('Woven natural jute',(.42,.27,.135),1,surface='linen')
RUG_BORDER=material('Jute ochre border',(.32,.19,.08),1)
PLANTER=material('Travertine planter',(.57,.43,.26),.94,surface='stone')
WOOD=material('Olive bark',(.12,.075,.03),1)
EARTH=material('Soil',(.07,.045,.02),1)
LEAVES=[material('Olive leaves '+str(i),c,.86) for i,c in enumerate([(.11,.17,.045),(.19,.25,.075),(.31,.32,.13)])]
CERAMIC=material('Sand ceramic glaze',(.50,.32,.14),.37)
CERAMIC_DARK=material('Burnished terracotta',(.33,.135,.055),.53)
SCULPTURE=material('Original limestone sculpture',(.69,.56,.37),.70,surface='stone')
PAPER=material('Natural book paper',(.77,.68,.53),.92)
BOOKS=[material('Plain book cover '+str(i),c,.86) for i,c in enumerate([(.33,.18,.085),(.25,.29,.15),(.64,.49,.27)])]
ROCK=material('Coastal limestone',(.42,.38,.27),.96,surface='stone')
DISTANT_ROCK=material('Distant warm island',(.24,.31,.25),1)
GLASS=material('Skylight glass',(.76,.83,.82),.12);GLASS.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.055;GLASS.surface_render_method='DITHERED'
LAMP=material('Warm lamp diffuser',(.9,.61,.25),.35);LAMP.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(1,.63,.25,1);LAMP.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=1.2

manifest={'schemaVersion':2,'generator':'scripts/blender/build_museum.py','blenderVersion':bpy.app.version_string,'units':'metres','up':'Y','roomOffsetZ':18,'files':{'hall':'/museum/hall.glb','extension':'/museum/extension.glb','outside':'/museum/outside.glb'},'anchors':{},'obstaclesByModule':{},'boundsByModule':{},'compression':{'extension':'KHR_draco_mesh_compression','decoderPath':'/museum/draco/','positionBits':16,'normalBits':12,'colorBits':8},'materials':'Original warm PBR maps, geometry raycast vertex AO; no artworks or editorial text baked into architecture','outside':{'attachAt':'last room front portal','localOrigin':[0,0,0],'seaStartZ':10,'seaY':-.7,'seaEndZ':180}}
for stem,salon in [('hall',False),('extension',True)]:
    obstacles=main_room(salon)
    anchors={'origin':(0,0,0),'portal_front':(0,2.2,9),'portal_about':(-6,2.2,-6.5),'portal_contact':(6,2.2,-6.5),'about':(-9.8,3.8,-6.5),'contact':(9.8,3.8,-6.5)}
    if salon:anchors['portal_back']=(0,2.2,-9)
    slots=[(side*5.86,2.65,z) for side in [-1,1] for z in CFG['artworkBaysZ']]
    slots.extend([(-3.5,2.65,-8.86),(-3.5,2.65,8.86) if salon else (0,2.65,-8.86),(3.5,2.65,-8.86),(3.5,2.65,8.86)])
    for i,p in enumerate(slots):anchors['slot_'+str(i+1).zfill(2)]=p
    manifest['boundsByModule'][stem]=prepare_and_export(stem,anchors);manifest['anchors'][stem]=anchors;manifest['obstaclesByModule'][stem]=obstacles
manifest['obstaclesByModule']['outside']=outdoor();manifest['boundsByModule']['outside']=prepare_and_export('outside',{'origin':(0,0,0)});manifest['anchors']['outside']={'origin':(0,0,0)}
manifest['obstacles']=manifest['obstaclesByModule']['hall']
manifest['bounds']={'min':[min(b['min'][i] for b in manifest['boundsByModule'].values()) for i in range(3)],'max':[max(b['max'][i] for b in manifest['boundsByModule'].values()) for i in range(3)]}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('MUSEUM_EXPORT_COMPLETE',json.dumps({k:(OUT/(k+'.glb')).stat().st_size for k in ['hall','extension','outside']}),flush=True)
