"""Original potted kentia, zamioculcas and aspidistra for the museum.

Blender --background --threads 2 --python scripts/blender/companion_plants.py
All blades, stems, hollow pots, soil particles and texture pixels are authored
here. Runtime and collision placement share lib/museum/companion-plants.json.
"""
import bpy
import hashlib
import json
import math
import random
from pathlib import Path
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/museum/plants/companions'
TEX = OUT / 'textures'
TEX.mkdir(parents=True, exist_ok=True)
CONFIG = json.loads((ROOT / 'lib/museum/companion-plants.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
rng = random.Random(29415)


def image(name, pixels, linear=False):
    h, w, _ = pixels.shape
    im = bpy.data.images.new(name, width=w, height=h, alpha=True)
    im.colorspace_settings.name = 'Non-Color' if linear else 'sRGB'
    im.pixels.foreach_set(np.dstack((np.clip(pixels, 0, 1), np.ones((h, w)))).astype(np.float32).ravel())
    im.filepath_raw = str(TEX / (name + '.png'))
    im.file_format = 'PNG'
    im.save()
    im.pack()
    return im


def normal(name, height, metres):
    dx, dy = np.gradient(height, axis=1), np.gradient(height, axis=0)
    n = np.dstack((-dx * height.shape[1] / metres, -dy * height.shape[0] / metres, np.ones_like(height)))
    n /= np.linalg.norm(n, axis=2)[..., None]
    return image(name, n * .5 + .5, True)


def material(name, color, bump, roughness, double=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = not double
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bs = nodes.get('Principled BSDF')
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Specular IOR Level'].default_value = .2
    col = nodes.new('ShaderNodeTexImage'); col.image = color
    vertex = nodes.new('ShaderNodeVertexColor'); vertex.layer_name = 'Tint'
    mult = nodes.new('ShaderNodeMixRGB'); mult.blend_type = 'MULTIPLY'; mult.inputs[0].default_value = 1
    links.new(col.outputs['Color'], mult.inputs[1]); links.new(vertex.outputs['Color'], mult.inputs[2])
    links.new(mult.outputs[0], bs.inputs['Base Color'])
    tex = nodes.new('ShaderNodeTexImage'); tex.image = bump
    nm = nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = .3
    links.new(tex.outputs['Color'], nm.inputs['Color']); links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    return mat


N = 512
y, x = np.mgrid[0:N, 0:N] / (N - 1)
noise = np.random.default_rng(14521).normal(0, 1, (N, N))
vein = np.exp(-((x - .5) / .007)**2)
side_veins = np.maximum(0, np.cos((y - np.abs(x - .5) * .65) * 79))**28
leaf_detail = .00008 * vein + .000014 * side_veins + noise * .000002
leaf_color = np.zeros((N, N, 3)) + (.115, .205, .075)
leaf_color += (noise * .0015 + .003 * np.sin(x * 23 + y * 41))[..., None]
leaf_color += vein[..., None] * (.012, .019, .006)
LEAF = material('Companion dark veined leaves', image('leaf', leaf_color), normal('leaf-normal', leaf_detail, .14), .7, True)
parallel = np.sin(x * 165 + np.sin(y * 7))
palm_color = np.zeros((N, N, 3)) + (.145, .235, .083)
palm_color += (parallel * .002 + noise * .001)[..., None]
PALM = material('Palm fine parallel venation', image('palm', palm_color), normal('palm-normal', parallel * .000015 + vein * .00007, .16), .76, True)
stem_color = np.zeros((N, N, 3)) + (.17, .215, .085)
stem_color += (np.sin(x * 121) * .003 + noise * .001)[..., None]
STEM = material('Stems subtle fibrous skin', image('stems', stem_color), normal('stem-normal', noise * .000006, .15), .83)
clumps = np.sin(x * 143 + np.sin(y * 83)) * np.cos(y * 187 + np.sin(x * 67))
soil_color = np.zeros((N, N, 3)) + (.143, .088, .048)
soil_color += (clumps * .015 + noise * .003)[..., None]
SOIL = material('Organic dark humus', image('humus', soil_color), normal('humus-normal', clumps * .00065 + noise * .00013, .22), 1)
clay = np.zeros((N, N, 3)) + (.285, .25, .205)
clay += (noise * .002 + .004 * np.sin(x * 43 + y * 29))[..., None]
POT = material('Unglazed fine mineral ceramic', image('clay', clay), normal('clay-normal', noise * .000018, .3), .95)
SHADOW = bpy.data.materials.new('Soft floor contact')
SHADOW.use_nodes = True
SHADOW.surface_render_method = 'BLENDED'
bs = SHADOW.node_tree.nodes.get('Principled BSDF')
bs.inputs['Base Color'].default_value = (.055, .035, .017, 1)
bs.inputs['Alpha'].default_value = .8
bs.inputs['Roughness'].default_value = 1
# Runtime replaces this with an unlit MeshBasicMaterial using exported vertex alpha.


def batch():
    return {'v': [], 'f': [], 'uv': [], 'c': []}


def vertex(data, p, uv=(0, 0), tint=(1, 1, 1, 1)):
    data['v'].append(tuple(p)); data['uv'].append(uv); data['c'].append(tint)


def tube(data, points, radii, sides=7):
    start = len(data['v'])
    for j, (point, radius) in enumerate(zip(points, radii)):
        radius = float(radius)
        direction = (points[min(j + 1, len(points)-1)] - points[max(0, j-1)]).normalized()
        cross = direction.cross(Vector((0, 0, 1))).normalized()
        up = direction.cross(cross).normalized()
        for k in range(sides + 1):
            a = k / sides * math.tau
            vertex(data, point + radius * (cross * math.cos(a) + up * math.sin(a)), (k / sides, j / 4), (.8, .85, .72, 1))
            if j and k < sides:
                i = start + j * (sides + 1) + k
                data['f'].append((i, i+1, i-sides, i-sides-1))


def curve(a, b, c, d, count=15):
    return [(1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d for t in map(float, np.linspace(0, 1, count))]


def sample(points, t):
    f = min(.999999, max(0, t)) * (len(points)-1)
    return points[int(f)].lerp(points[int(f)+1], f-int(f))


def blade(data, start, direction, length, width, droop=.13, rows=9, roll=0):
    direction = direction.normalized()
    cross = direction.cross(Vector((0, 1, 0))).normalized()
    up = cross.cross(direction).normalized()
    cross, up = cross*math.cos(roll)+up*math.sin(roll), up*math.cos(roll)-cross*math.sin(roll)
    offset = len(data['v'])
    shade = rng.uniform(.67, 1.18)
    tint = (shade*rng.uniform(.92, 1.12), shade, shade*rng.uniform(.91, 1.07), 1)
    asymmetry, twist = rng.uniform(-.11, .11), rng.uniform(-.13, .13)
    for row in range(rows + 1):
        t = row / rows
        # A tapered base, asymmetric shoulders, central fold and fine wavy edge.
        profile = max(.001, math.sin(math.pi*t))**.76 * (1-.24*t)
        for side in (-1, -.5, 0, .5, 1):
            w = width * .5 * profile * side * (1+asymmetry*side)
            fold = width * profile * (.09 * abs(side) + twist*side*t)
            ripple = width * .009 * abs(side)**4 * math.sin(t*39+roll)
            p = start + direction*length*t + cross*w + up*(fold+ripple+length*.04*math.sin(math.pi*t))
            p.y -= length*droop*t*t
            vertex(data, p, (.5 + .499*side*profile, t), tint)
    for row in range(rows):
        for col in range(4):
            a = offset + row*5 + col
            for face in [(a, a+5, a+6), (a, a+6, a+1)]:
                p = [Vector(data['v'][i]) for i in face]
                n = (p[1]-p[0]).cross(p[2]-p[0])
                if n.length > 1e-10:
                    data['f'].append(tuple(reversed(face)) if n.dot(up) < 0 else face)


def mesh(name, data, material, parent):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(p[0], -p[2], p[1]) for p in data['v']], [], data['f'])
    me.update()
    obj = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(obj)
    obj.parent = parent
    me.materials.append(material)
    uv = me.uv_layers.new(name='UVMap')
    colors = me.color_attributes.new(name='Tint', type='FLOAT_COLOR', domain='POINT')
    for i, color in enumerate(data['c']): colors.data[i].color = color
    for polygon in me.polygons:
        polygon.use_smooth = True
        for loop in polygon.loop_indices: uv.data[loop].uv = data['uv'][me.loops[loop].vertex_index]
    return obj


def planter(spec, index):
    radius, h = spec['potRadius'], spec['potHeight']
    pot, soil, shadow = batch(), batch(), batch()
    # Closed base, inset foot, softly rounded lip, real inner wall and recessed soil.
    profile = [(.001, .018), (radius*.71, .018), (radius*.77, .032), (radius*.8, .075),
               (radius*.91, h*.55), (radius*.99, h-.018), (radius, h-.006),
               (radius*.984, h+.003), (radius-.022, h+.003), (radius-.026, h-.008),
               (radius-.028, h-.065), (radius*.76, .07), (.001, .07)]
    tint = [(1.1, 1.04, .95, 1), (.72, .74, .74, 1), (1.02, .94, .85, 1)][index]
    sides = 80
    for j, (r, level) in enumerate(profile):
        for k in range(sides+1):
            a = k / sides * math.tau
            vertex(pot, (r*math.cos(a), level, r*math.sin(a)), (k/sides*2, level/.3), tint)
            if j and k < sides:
                q = j*(sides+1)+k
                pot['f'].append((q, q+1, q-sides, q-sides-1))
    soil_radius = radius-.031
    level = h-.033
    rings, segments = 6, 56
    def soil_y(px, pz):
        return level + (1-(math.hypot(px,pz)/soil_radius)**4)*(.003+.002*math.sin(px*47)*math.cos(pz*61))
    vertex(soil, (0, soil_y(0,0), 0))
    for ring in range(1, rings+1):
        for j in range(segments):
            a = j/segments*math.tau; r = soil_radius*ring/rings
            px, pz = r*math.cos(a), r*math.sin(a)
            shade = rng.uniform(.74, 1.08)
            vertex(soil, (px, soil_y(px,pz), pz), (px/.22,pz/.22), (shade,shade,shade,1))
    for j in range(segments): soil['f'].append((0, 1+(j+1)%segments, 1+j))
    for ring in range(rings-1):
        for j in range(segments):
            a=1+ring*segments+j; b=1+ring*segments+(j+1)%segments
            soil['f'].append((a,b,b+segments,a+segments))
    for i in range(115):
        r = math.sqrt(rng.random())*(soil_radius-.024); a = rng.random()*math.tau
        px,pz=r*math.cos(a),r*math.sin(a); levelp=soil_y(px,pz)
        size=rng.uniform(.003,.009); shade=rng.uniform(.7,1.35)
        offset=len(soil['v']); color=(shade,shade,shade,1)
        vertex(soil,(px,levelp+size*.7,pz),(px/.22,pz/.22),color)
        for k in range(5):
            a = k/5*math.tau+i
            dx = size*math.cos(a)*(1.8 if i%9==0 else 1)
            dz = size*math.sin(a)*.8
            vertex(soil,(px+dx,levelp-.001,pz+dz),((px+dx)/.22,(pz+dz)/.22),color)
        for k in range(5): soil['f'].append((offset,offset+1+(k+1)%5,offset+1+k))
    for ring, (r, alpha) in enumerate([(0,.24), (radius*.72,.24), (radius*.97,.11), (radius*1.3,0)]):
        for j in range(64):
            a=j/64*math.tau
            vertex(shadow,(r*math.cos(a),-.007,r*math.sin(a)),tint=(1,1,1,alpha))
            if ring:
                q=ring*64+j; b=ring*64+(j+1)%64
                shadow['f'].append((q,b,b-64,q-64))
    return pot, soil, shadow


report = {}
for index, (species, spec) in enumerate(CONFIG['species'].items()):
    group=bpy.data.objects.new(species,None); bpy.context.collection.objects.link(group)
    stems, leaves = batch(),batch()
    base_y=spec['potHeight']-.035
    count = 15 if species=='kentia' else 12 if species=='zamioculcas' else 23
    leaf_count=0
    for i in range(count):
        angle=i*2.399963+rng.uniform(-.24,.24)
        radial=Vector((math.cos(angle),0,math.sin(angle)))
        sideways=Vector((-math.sin(angle),0,math.cos(angle)))
        start=radial*rng.uniform(.025,.095)+Vector((0,base_y,0))
        if species=='kentia':
            reach=rng.uniform(.52,1.06); height=rng.uniform(.78,1.35)
            end=start+radial*reach+Vector((0,height*.7,0))
            path=curve(start,start+radial*.08+Vector((0,height*.79,0)),end-radial*.25+Vector((0,height*.56,0)),end)
            tube(stems,path,[.013*(1-t)**1.1+.0006 for t in np.linspace(0,1,len(path))],8)
            for j in range(25):
                t=.28+j/25*.7
                for side in (-1,1):
                    p=sample(path,t+side*.006)
                    direction=(sideways*side+radial*(.17+t*.5)+Vector((0,.12-t*.3,0))).normalized()
                    length=(.13+.23*math.sin((t-.2)/.8*math.pi))*rng.uniform(.85,1.13)
                    blade(leaves,p,direction,length,length*rng.uniform(.07,.1),.18,7,rng.uniform(-.3,.3))
                    leaf_count+=1
        elif species=='zamioculcas':
            height=rng.uniform(.46,.79); reach=rng.uniform(.19,.4)
            end=start+radial*reach+Vector((0,height,0))
            path=curve(start,start+Vector((0,height*.52,0)),end-radial*.08,end)
            tube(stems,path,[.014*(1-t)+.002 for t in np.linspace(0,1,len(path))],9)
            for j in range(6):
                t=.24+j*.127
                for side in (-1,1):
                    p=sample(path,t+side*.018)
                    direction=sideways*side*.8+radial*.36+Vector((0,.45,0))
                    length=rng.uniform(.115,.165)*(1-t*.13)
                    blade(leaves,p,direction,length,length*.58,.07,9,rng.uniform(-.25,.25))
                    leaf_count+=1
            blade(leaves,end,radial*.35+Vector((0,1,0)),.11,.058,.08,9)
            leaf_count+=1
        else:
            length=rng.uniform(.54,.91); lean=rng.uniform(.3,.82)
            end=start+radial*rng.uniform(.05,.19)+Vector((0,rng.uniform(.13,.3),0))
            path=curve(start,start+Vector((0,.07,0)),end-radial*.03,end,7)
            tube(stems,path,[.007-.003*t for t in np.linspace(0,1,len(path))],7)
            blade(leaves,end,radial*lean+Vector((0,1,0)),length,length*rng.uniform(.2,.28),rng.uniform(.2,.37),16,rng.uniform(-.3,.3))
            leaf_count+=1
    # Preserve authored blade details, fitting only each specimen's full envelope.
    verts=stems['v']+leaves['v']
    radial_fit=spec['radius']/max(math.hypot(p[0],p[2]) for p in verts)
    height_fit=(spec['height']-base_y)/(max(p[1] for p in verts)-base_y)
    for data in [stems,leaves]: data['v']=[(p[0]*radial_fit,base_y+(p[1]-base_y)*height_fit,p[2]*radial_fit) for p in data['v']]
    pot,soil,shadow=planter(spec,index)
    objects=[mesh(species+' stems',stems,STEM,group),mesh(species+' leaves',leaves,PALM if species=='kentia' else LEAF,group),mesh(species+' hollow pot',pot,POT,group),mesh(species+' humus particles',soil,SOIL,group),mesh(species+' contact',shadow,SHADOW,group)]
    for obj in objects: obj['assetRole']='companion-plant'
    report[species]={'leafCount':leaf_count,'height':spec['height'],'radius':spec['radius'],'meshBatches':len(objects),'triangles':sum(len(p.vertices)-2 for obj in objects for p in obj.data.polygons)}

bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'companion-plants.blend'))
target=ROOT/'public/museum/companion-plants.glb'
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=91,export_vertex_color='NAME',export_vertex_color_name='Tint',export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=18,export_draco_normal_quantization=12,export_draco_texcoord_quantization=14)
report={'species':report,'bytes':target.stat().st_size,'blender':bpy.app.version_string,'source':'scripts/blender/companion_plants.py','allGeometryAndTexturesOriginal':True}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
files=[Path(__file__).resolve(),target,*sorted(TEX.glob('*.png'))]
(OUT/'provenance.json').write_text(json.dumps({'externalMediaUsed':False,'authorship':'Original procedural geometry and textures for this project','files':[{'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]},indent=2)+'\n')
print('COMPANION_REPORT '+json.dumps(report))
