"""Original small-leaved indoor ficus, in the existing tree/pot envelopes.

Blender --background --threads 2 --python scripts/blender/tree_ficus.py -- reading
Run again with central; add --render for a neutral studio composition.
The legacy fig-*.glb filenames preserve the room/bake asset contract.
All geometry and textures are generated here; no external media is used.
"""
import bpy
import bmesh
import hashlib
import json
import math
import random
import sys
from pathlib import Path

import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
VARIANT = 'reading' if 'reading' in ARGS else 'central'
READING = VARIANT == 'reading'
OUT = ROOT / 'assets/museum/trees' / ('ficus-' + VARIANT)
TEX = OUT / 'textures'
ART = ROOT / 'artifacts/ficus-qa'
for directory in (OUT, TEX, ART):
    directory.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
rng = random.Random(58131 if READING else 79193)


def xyz(p):
    return (p[0], -p[2], p[1])


def image(name, pixels, noncolor=False):
    h, w, _ = pixels.shape
    im = bpy.data.images.new(name, width=w, height=h, alpha=True)
    im.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    im.pixels.foreach_set(np.dstack((np.clip(pixels, 0, 1), np.ones((h, w)))).astype(np.float32).ravel())
    im.filepath_raw = str(TEX / (name + '.png'))
    im.file_format = 'PNG'
    im.save()
    im.pack()
    return im


def normal_image(name, height, metres):
    dx = np.gradient(height, axis=1) * height.shape[1] / metres
    dy = np.gradient(height, axis=0) * height.shape[0] / metres
    n = np.dstack((-dx, -dy, np.ones_like(dx)))
    n /= np.linalg.norm(n, axis=2)[..., None]
    return image(name, n * .5 + .5, True)


# Shallow bark mottling: deliberately no regular cylinder-like horizontal bands.
N = 512
y, x = np.mgrid[0:N, 0:N] / (N - 1)
noise = np.random.default_rng(219)
grain = noise.normal(0, 1, (N, N))
cloud = .009 * np.sin(x * 31 + np.sin(y * 23)) + .007 * np.sin(y * 53 + x * 9)
bark_color = np.zeros((N, N, 3)) + (.255, .231, .184)
bark_color += (cloud + grain * .002)[..., None]
bark = image('ficus-bark-albedo', bark_color)
bark_normal = normal_image('ficus-bark-normal', cloud * .004 + grain * .00003, .35)

# Fine pinnate venation on a pointed elliptic leaf, kept below silhouette contrast.
vein = np.exp(-((x - .5) / .007)**2) * (.85 - y * .55)
secondary = np.zeros((N, N))
for start in np.linspace(.13, .80, 8):
    distance = np.abs(y - start - np.abs(x - .5) * .66)
    secondary = np.maximum(secondary, np.exp(-(distance / .0022)**2) * (1 - np.abs(x - .5) * 1.7))
edge = np.abs(x - .5) * 2
variation = .004 * np.sin(x * 27 + y * 41) + grain * .0014
leaf_color = np.zeros((N, N, 3)) + (.125, .220, .071)
leaf_color += variation[..., None]
leaf_color += vein[..., None] * np.array([.018, .027, .008])
leaf_color += secondary[..., None] * np.array([.004, .008, .002])
leaf_color *= (1 - edge[..., None] * .055)
leaf_map = image('ficus-leaf-albedo', leaf_color)
leaf_normal = normal_image('ficus-leaf-normal', vein * .00007 + secondary * .000015 + grain * .000002, .10)

# Original humus texture: mixed particle scales, without pale gravel or a flat fill.
soil_noise = np.random.default_rng(4102)
soil_grain = soil_noise.normal(0, 1, (N, N))
aggregates = np.sin(x * 151 + np.sin(y * 79)) * np.sin(y * 177 + np.sin(x * 97))
soil_relief = aggregates * .00065 + soil_grain * .00012
soil_color = np.zeros((N, N, 3)) + (.145, .091, .049)
soil_color += (aggregates * .013 + soil_grain * .003)[..., None]
soil_map = image('ficus-soil-albedo', soil_color)
soil_normal = normal_image('ficus-soil-normal', soil_relief, .22)


def material(name, albedo, normal, roughness):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bs = nodes.get('Principled BSDF')
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Specular IOR Level'].default_value = .22
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = albedo
    color = nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Tint'
    multiply = nodes.new('ShaderNodeMixRGB')
    multiply.blend_type = 'MULTIPLY'
    multiply.inputs[0].default_value = 1
    links.new(tex.outputs['Color'], multiply.inputs[1])
    links.new(color.outputs['Color'], multiply.inputs[2])
    links.new(multiply.outputs[0], bs.inputs['Base Color'])
    texn = nodes.new('ShaderNodeTexImage')
    texn.image = normal
    nm = nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = .32
    links.new(texn.outputs['Color'], nm.inputs['Color'])
    links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    return m


BARK = material('Ficus warm bark microrelief', bark, bark_normal, .91)
MATURE = material('Ficus mature curved lamina', leaf_map, leaf_normal, .66)
YOUNG = material('Ficus young curved lamina', leaf_map, leaf_normal, .61)
SOIL = material('Ficus granular dark humus', soil_map, soil_normal, 1)
SOIL.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value = .08
for m in (MATURE, YOUNG):
    m.use_backface_culling = False


def batch():
    return {'v': [], 'f': [], 'uv': [], 'c': []}


wood, coarse, leaves, young = batch(), batch(), batch(), batch()
leaf_lengths = []


def tube(points, radii, sides=6, data=None, caps=True):
    data = wood if data is None else data
    base = len(data['v'])
    distance = 0
    for j, (point, radius) in enumerate(zip(points, radii)):
        tangent = (points[min(j + 1, len(points) - 1)] - points[max(j - 1, 0)]).normalized()
        reference = Vector((0, 0, 1)) if abs(tangent.z) < .95 else Vector((1, 0, 0))
        a = tangent.cross(reference).normalized()
        b = tangent.cross(a).normalized()
        if j:
            distance += (point - points[j - 1]).length
        for k in range(sides + 1):
            angle = k * math.tau / sides
            r = float(radius) * (1 + .032 * math.sin(angle * 3 + j * .4))
            p = point + r * (a * math.cos(angle) + b * math.sin(angle))
            data['v'].append(tuple(p))
            data['uv'].append((k / sides * radius * math.tau / .35, distance / .35))
            data['c'].append((.94, .94, .94, 1))
        if j:
            offset = base + j * (sides + 1)
            for k in range(sides):
                data['f'].append((offset + k, offset + k + 1, offset + k - sides, offset + k - sides - 1))
    if caps:
        data['f'].append(tuple(base + k for k in reversed(range(sides))))
        top = base + (len(points) - 1) * (sides + 1)
        data['f'].append(tuple(top + k for k in range(sides)))


def bezier(a, b, c, d, count=8):
    return [(1 - t)**3 * a + 3 * (1 - t)**2 * t * b + 3 * (1 - t) * t*t * c + t**3 * d for t in map(float, np.linspace(0, 1, count))]


def sample(path, t):
    value = min(.99999, max(0, t)) * (len(path) - 1)
    i = int(value)
    return path[i].lerp(path[i + 1], value - i)


def leaf(origin, direction, length, roll, fresh=False):
    data = young if fresh else leaves
    direction = direction.normalized()
    cross = direction.cross(Vector((0, 1, 0))).normalized()
    up = cross.cross(direction).normalized()
    cross, up = cross * math.cos(roll) + up * math.sin(roll), -cross * math.sin(roll) + up * math.cos(roll)
    width = length * rng.uniform(.34, .49)
    bend = rng.uniform(.08, .25)
    twist = rng.uniform(-.19, .19)
    asymmetry = rng.uniform(-.16, .16)
    shade = rng.uniform(.68, 1.17) * (1.19 if fresh else 1)
    # Subtle warm/cool shifts, not a collection of identical green cutouts.
    tint = (shade * rng.uniform(.86, 1.13), shade, shade * rng.uniform(.86, 1.16), 1)
    offset = len(data['v'])
    rows = 5
    for row in range(rows + 1):
        t = row / rows
        # Rounded basal shoulders and a long, narrow drip tip; each blade is cupped.
        profile = math.sin(math.pi * t)**.83 * (1 - .38 * t)
        for side in (-1, 0, 1):
            across = side * width * .5 * profile * (1 + asymmetry * side)
            across += length * .027 * math.sin(math.pi * t) * twist
            curl = length * (.048 * math.sin(math.pi * t) - bend * t*t + .07 * side*side * profile + twist * side * t * profile)
            p = origin + direction * length * t + cross * across + up * curl
            data['v'].append(tuple(p))
            data['uv'].append((.5 + side * profile * .49, t))
            data['c'].append(tint)
    for row in range(rows):
        for side in range(2):
            a = offset + row * 3 + side
            for face in ((a, a + 3, a + 4), (a, a + 4, a + 1)):
                points = [Vector(data['v'][i]) for i in face]
                normal = (points[1] - points[0]).cross(points[2] - points[0])
                if normal.length < 1e-10:
                    continue
                data['f'].append(tuple(reversed(face)) if normal.dot(up) < 0 else face)
    leaf_lengths.append(length)


# Tapered, gently leaning trunk with connected, irregular primary boughs.
trunk = [Vector(p) for p in [(0, .70, 0), (-.02, .93, .015), (-.055, 1.26, .01), (-.045, 1.65, -.01), (.035, 2.10, .02), (.085, 2.65, .06), (.035, 3.18, .025), (.10, 3.65, .015), (.16, 4.13, .02)]]
if READING:
    # A supple, leaning reading-corner tree; the central specimen stays upright.
    trunk = [Vector((p.x - .20 * math.sin((p.y - .70) / 3.43 * math.pi * .8), p.y, p.z + .09 * (p.y - .70))) for p in trunk]
    trunk[-1].y = 3.82
else:
    trunk = [Vector((-p.x * .75, p.y, p.z * -1.4)) for p in trunk]
tube(trunk, [.074, .063, .052, .043, .032, .023, .014, .007, .0018], 18, coarse)
for i in range(4):
    a = i * math.tau / 4 + .3
    tube([Vector((math.cos(a) * .095, .702, math.sin(a) * .095)), trunk[1], trunk[2]], [.012, .033, .043], 8, coarse)
for i, a in enumerate([-.45, 1.85, 3.75]):
    a += .3 if READING else 1.1
    radial = Vector((math.cos(a), 0, math.sin(a)))
    sideways = Vector((-math.sin(a), 0, math.cos(a)))
    # Low, unequal roots merge into the humus; no radial star of exposed spikes.
    tube([trunk[0] + Vector((0, .067, 0)), radial * .062 + Vector((0, .741, 0)), radial * .10 + sideways * .01 + Vector((0, .725, 0)), radial * [.16, .19, .14][i] + sideways * .025 + Vector((0, .707, 0))], [.016, .011, .005, .0008], 7, coarse)

branch_count = 20 if READING else 21
for branch in range(branch_count):
    t = branch / (branch_count - 1)
    height = (1.42 + t * 1.96 if READING else 1.87 + t * 1.67) + rng.uniform(-.13, .13)
    for j in range(len(trunk) - 1):
        if trunk[j].y <= height <= trunk[j + 1].y:
            start = trunk[j].lerp(trunk[j + 1], (height - trunk[j].y) / (trunk[j + 1].y - trunk[j].y))
            break
    angle = branch * 2.399 + rng.uniform(-.42, .42) + (.6 if READING else 2.0)
    radial = Vector((math.cos(angle), 0, math.sin(angle)))
    reach = (.68 + .32 * math.sin(t * math.pi)) * rng.uniform(.68, .93)
    rise = rng.uniform(.31, .64) * (1 - t * .25) if READING else rng.uniform(.49, .81) * (1 - t * .20)
    end = start + radial * reach + Vector((0, rise, 0))
    branch_path = bezier(start, start + radial * reach * .35 + Vector((0, .23, 0)), end + Vector((0, .25, 0)), end)
    radius = .023 * (1 - t * .70)
    tube(branch_path, [radius * (1 - s)**1.1 + .0014 for s in np.linspace(0, 1, len(branch_path))], 9, coarse)
    # Secondary branches form loose fans, with unequal gaps and hanging tips.
    for twig in range(rng.randint(5, 7)):
        attachment = rng.uniform(.28, .97)
        base = sample(branch_path, attachment)
        azimuth = angle + (-1 if twig % 2 else 1) * rng.uniform(.55, 1.35)
        outward = Vector((math.cos(azimuth), 0, math.sin(azimuth)))
        length = rng.uniform(.22, .42)
        tip = base + outward * length + Vector((0, rng.uniform(-.20, .10), 0))
        path = bezier(base, base + outward * length * .26 + Vector((0, .12, 0)), tip + Vector((0, .10, 0)), tip, 6)
        tube(path, [.0046, .0039, .0031, .0023, .0014, .00055], 5)
        shoots = [path]
        for sub in range(2):
            subbase = sample(path, rng.uniform(.30, .70))
            subangle = azimuth + (-1 if sub else 1) * rng.uniform(.65, 1.25)
            subdir = Vector((math.cos(subangle), rng.uniform(-.35, .1), math.sin(subangle)))
            subtip = subbase + subdir * rng.uniform(.15, .25)
            subpath = bezier(subbase, subbase + subdir * .06 + Vector((0, .035, 0)), subtip + Vector((0, .04, 0)), subtip, 4)
            tube(subpath, [.0021, .0016, .0010, .00035], 4)
            shoots.append(subpath)
        for shoot_index, shoot in enumerate(shoots):
            nodes = rng.randint(6, 9) if shoot_index == 0 else rng.randint(4, 7)
            for node in range(nodes):
                phase = .12 + .86 * node / max(1, nodes - 1)
                origin = sample(shoot, phase)
                a = azimuth + node * 2.399 + rng.uniform(-.45, .45)
                direction = Vector((math.cos(a), rng.uniform(-.95, .30), math.sin(a))).normalized()
                petiole = origin + direction * rng.uniform(.011, .021)
                # Ends are inside twig/blade; omit their invisible caps.
                tube([origin, petiole], [.00065, .0003], 3, caps=False)
                fresh = phase > .85 and rng.random() < .42
                leaf(petiole, direction, rng.uniform(.061, .112) * (.76 if fresh else 1), rng.uniform(-.90, .90), fresh)

# Match existing floor/obstacle envelope without changing room navigation.
all_batches = [wood, coarse, leaves, young]
all_vertices = [p for data in all_batches for p in data['v']]
horizontal = min(1, (1.10 if READING else .99) / max(math.hypot(p[0], p[2]) for p in all_vertices))
vertical = ((3.95 if READING else 4.35) - .70) / (max(p[1] for p in all_vertices) - .70)
for data in all_batches:
    data['v'] = [(p[0] * horizontal, .70 + (p[1] - .70) * vertical, p[2] * horizontal) for p in data['v']]

# Soil sits just above the former flat disc, safely recessed under the pot lip.
# Its dimensions come from the same room contract as the existing planter.
contract = json.loads((ROOT / 'scripts/blender/contemporary_contract.json').read_text())
placement = contract['treesByModule']['hall' if READING else 'extension'][0]
soil_radius = (placement['potRadius'] - .037) / placement['scale']
soil_level = (placement['soilY'] + .016 - placement['position'][1]) / placement['scale']
soil_rng = random.Random(5127 if READING else 6341)
soil_data = batch()


def soil_height(px, pz):
    radius = math.hypot(px, pz)
    edge_fade = max(0, 1 - (radius / soil_radius)**4)
    return soil_level + edge_fade * (.0045 + .003 * math.sin(px * 31 + pz * 17) * math.cos(pz * 39 - px * 11) + .004 * math.exp(-radius * radius / .022))


def soil_vertex(px, py, pz, tint):
    soil_data['v'].append((px, py, pz))
    soil_data['uv'].append((px / .22, pz / .22))
    # Gentle local occlusion under the trunk, independent of the room lightmap.
    contact = 1 - .32 * math.exp(-(px * px + pz * pz) / .018)
    soil_data['c'].append((tint * contact, tint * contact, tint * contact, 1))


segments, rings = 64, 7
soil_vertex(0, soil_height(0, 0), 0, .85)
for ring in range(1, rings + 1):
    for segment in range(segments):
        angle = segment * math.tau / segments
        radius = soil_radius * ring / rings
        if ring < rings:
            radius += soil_rng.uniform(-.008, .008)
        px, pz = radius * math.cos(angle), radius * math.sin(angle)
        soil_vertex(px, soil_height(px, pz), pz, soil_rng.uniform(.80, 1.10))
for i in range(segments):
    soil_data['f'].append((0, 1 + (i + 1) % segments, 1 + i))
for ring in range(rings - 1):
    for i in range(segments):
        a = 1 + ring * segments + i
        b = 1 + ring * segments + (i + 1) % segments
        soil_data['f'].append((a, b, b + segments, a + segments))

# Small nonuniform clods and woody fragments are genuine relief, joined in one batch.
for particle in range(190):
    angle = soil_rng.random() * math.tau
    radial = math.sqrt(soil_rng.random()) * (soil_radius - .023)
    if radial < .085:
        continue
    px, pz = radial * math.cos(angle), radial * math.sin(angle)
    base = soil_height(px, pz)
    size = soil_rng.uniform(.004, .013)
    woody = particle % 7 == 0
    sx, sz = size * (2.1 if woody else 1), size * (.48 if woody else soil_rng.uniform(.6, 1.1))
    rotation = soil_rng.random() * math.tau
    tint = soil_rng.uniform(.63, 1.27) * (1.18 if woody else 1)
    offset = len(soil_data['v'])
    soil_vertex(px, base + size * .58, pz, tint)
    for k in range(6):
        a = k * math.tau / 6
        dx, dz = math.cos(a) * sx, math.sin(a) * sz
        soil_vertex(px + dx * math.cos(rotation) - dz * math.sin(rotation), base - .001 + soil_rng.uniform(0, .002), pz + dx * math.sin(rotation) + dz * math.cos(rotation), tint * soil_rng.uniform(.78, 1))
    for k in range(6):
        soil_data['f'].append((offset, offset + 1 + (k + 1) % 6, offset + 1 + k))


def mesh(name, data, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([xyz(p) for p in data['v']], [], data['f'])
    me.update()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    me.materials.append(mat)
    uv = me.uv_layers.new(name='UVMap')
    color = me.color_attributes.new(name='Tint', type='FLOAT_COLOR', domain='POINT')
    for i, c in enumerate(data['c']):
        color.data[i].color = c
    for poly in me.polygons:
        poly.use_smooth = True
        for loop in poly.loop_indices:
            uv.data[loop].uv = data['uv'][me.loops[loop].vertex_index]
    return obj


scaffold = mesh('Ficus continuous woody scaffold', coarse, BARK)
bpy.context.view_layer.objects.active = scaffold
scaffold.select_set(True)
remesh = scaffold.modifiers.new('Connected branch collars', 'REMESH')
remesh.mode = 'VOXEL'
remesh.voxel_size = .003
remesh.use_smooth_shade = True
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth = scaffold.modifiers.new('Soft collars', 'SMOOTH')
smooth.factor = .6
smooth.iterations = 3
bpy.ops.object.modifier_apply(modifier=smooth.name)
scaffold.data.calc_loop_triangles()
decimate = scaffold.modifiers.new('Scaffold budget', 'DECIMATE')
decimate.ratio = min(1, 5800 / len(scaffold.data.loop_triangles))
bpy.ops.object.modifier_apply(modifier=decimate.name)
me = scaffold.data
uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
color = me.color_attributes.get('Tint') or me.color_attributes.new(name='Tint', type='FLOAT_COLOR', domain='POINT')
for v in me.vertices:
    color.data[v.index].color = (.94, .94, .94, 1)
for poly in me.polygons:
    poly.use_smooth = True
    for loop in poly.loop_indices:
        co = me.vertices[me.loops[loop].vertex_index].co
        uv.data[loop].uv = (math.atan2(co.y, co.x) / math.tau, co.z / .35)
branches = mesh('Ficus trunk branches petioles', wood, BARK)
bpy.ops.object.select_all(action='DESELECT')
scaffold.select_set(True)
branches.select_set(True)
bpy.context.view_layer.objects.active = branches
bpy.ops.object.join()
bm = bmesh.new()
bm.from_mesh(branches.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(branches.data)
bm.free()
mature_mesh = mesh('Ficus mature pointed laminae', leaves, MATURE)
young_mesh = mesh('Ficus young pointed laminae', young, YOUNG)
soil_mesh = mesh('Ficus irregular soil and organic particles', soil_data, SOIL)
objects = [branches, mature_mesh, young_mesh, soil_mesh]
for obj in objects:
    obj['assetRole'] = 'ficus-tree'
    obj['rootY'] = .70
    obj['unbakedPBR'] = True
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'ficus-source.blend'))
target = ROOT / 'public/museum' / ('fig-' + VARIANT + '.glb')
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', export_yup=True, export_extras=True, export_cameras=False, export_lights=False, export_image_format='WEBP', export_image_quality=92, export_vertex_color='NAME', export_vertex_color_name='Tint', export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_draco_position_quantization=18, export_draco_normal_quantization=12, export_draco_texcoord_quantization=14)
vertices = [p for data in all_batches for p in data['v']]
report = {'variant': VARIANT, 'style': 'Original small-leaved weeping ficus', 'blender': bpy.app.version_string, 'leafCount': len(leaf_lengths), 'leafBladeMetresBeforeEnvelopeFit': [min(leaf_lengths), max(leaf_lengths)], 'horizontalFit': horizontal, 'verticalFit': vertical, 'rootY': .70, 'radiusMax': max(math.hypot(p[0], p[2]) for p in vertices), 'triangles': sum(len(p.vertices) - 2 for obj in objects for p in obj.data.polygons), 'meshBatches': 4, 'silhouette': 'low spreading leaning crown' if READING else 'upright narrow dense crown', 'soil': {'radiusLocal': soil_radius, 'baseYLocal': soil_level, 'vertices': len(soil_data['v']), 'triangles': sum(len(f)-2 for f in soil_data['f'])}, 'bytes': target.stat().st_size, 'bounds': {'min': np.min(vertices, axis=0).tolist(), 'max': np.max(vertices, axis=0).tolist()}, 'allGeometryAndTexturesOriginal': True}
(OUT / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
files = [*sorted(TEX.glob('*.png')), Path(__file__).resolve(), target]
(OUT / 'provenance.json').write_text(json.dumps({'authorship': 'Original procedural geometry and textures created for this project', 'externalMediaUsed': False, 'files': [{'path': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}, indent=2) + '\n')
print('FICUS_REPORT ' + json.dumps(report))
if '--render' in ARGS:
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    scene.render.resolution_x = 840
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs[0].default_value = (.60, .65, .72, 1)
    scene.world.node_tree.nodes.get('Background').inputs[1].default_value = .5
    pot = bpy.data.materials.new('Studio dark clay placeholder')
    pot.use_nodes = True
    pot.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.075, .059, .042, 1)
    pot.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .96
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=.48, depth=.74, location=xyz((0, .37, 0)))
    bpy.context.object.data.materials.append(pot)
    for pos, power, size in [((3, 5, 4), 450, 4), ((-3, 3, -1), 260, 3)]:
        bpy.ops.object.light_add(type='AREA', location=xyz(pos))
        obj = bpy.context.object
        obj.data.energy = power
        obj.data.shape = 'DISK'
        obj.data.size = size
        obj.rotation_euler = (Vector(xyz((0, 2, 0))) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=xyz((3.1, 2.8, 4.6)))
    camera = bpy.context.object
    camera.rotation_euler = (Vector(xyz((0, 2.2, 0))) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 4.9
    scene.camera = camera
    scene.render.filepath = str(ART / ('ficus-' + VARIANT + '-studio.png'))
    bpy.ops.render.render(write_still=True)
