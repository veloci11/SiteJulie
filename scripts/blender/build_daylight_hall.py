"""Derive the first hall only: true roof apertures and rounded alcoves.
Preserve accepted architecture, UV atlases, anchors and furnishings. No rebake or
runtime shadow/transmission cost. Blender 5.2.1; all added geometry is original.
"""
import bpy,bmesh,math,json
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/museum/daylight';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/museum/contemporary-experiments/hall/hall-contemporary.blend'))
scene=bpy.context.scene
walls=scene.objects['LIGHTMAP hall walls']
anchors={o.name:list(o.matrix_world.translation) for o in scene.objects if o.type=='EMPTY'}
def xyz(p):return (p[0],-p[2],p[1])
def select(objs):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0]
def plain(name,color,rough=.75,metal=0,emission=False):
 m=bpy.data.materials.new(name);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
 if emission:
  n=m.node_tree.nodes;n.clear();e=n.new('ShaderNodeEmission');e.inputs[0].default_value=(*color,1);o=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(e.outputs[0],o.inputs['Surface'])
 return m
# Sample the existing irradiance adjacent to the opening to keep added plaster
# in the same accepted exposure. Work in linear space, not display RGB.
def sample_plaster(point):
 vertices=[walls.matrix_world@v.co for v in walls.data.vertices]
 walls.data.calc_loop_triangles();tris=walls.data.loop_triangles
 tree=BVHTree.FromPolygons(vertices,[t.vertices for t in tris],all_triangles=True)
 nearest,normal,index,d=tree.find_nearest(Vector(xyz(point)))
 tri=tris[index];mat=walls.data.materials[tri.material_index]
 uv=walls.data.uv_layers.get('LightUV') or walls.data.uv_layers[-1]
 tex=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE')
 uvp=barycentric_transform(nearest,*[vertices[v] for v in tri.vertices],*[Vector((*uv.data[l].uv,0)) for l in tri.loops])
 w,h=tex.size;x=min(w-1,max(0,int(uvp.x*w)));y=min(h-1,max(0,int(uvp.y*h)))
 pix=tex.pixels[(y*w+x)*4:(y*w+x)*4+3]
 tint=mat.get('plasterColorLinear',[1,1,1]);scale=mat.get('lightmapRadianceScale',1)
 linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in pix]
 return tuple(linear[i]*tint[i]*scale for i in range(3))
left=sample_plaster((-5.85,4.6,-7.95));right=sample_plaster((5.85,4.6,-7.95))
# LIGHTMAP prefix retains the existing metric mineral-grain shader. Constant
# irradiance adds no texture atlas and is already shaded (MeshBasic runtime).
def plaster(name,color):
 m=plain('LIGHTMAP daylight '+name,color);m['plasterColorLinear']=color;m['lightmapRadianceScale']=1
 return m
leftmat=plaster('left arch',left);rightmat=plaster('right arch',right)
reveal=plaster('roof reveal',(.64,.62,.55))
bronze=plain('Daylight brushed champagne frame',(.31,.245,.16),.36,.45)
gasket=plain('Daylight shadow gasket',(.055,.052,.045),.75)
new=[]
def box(name,pos,size,mat,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(pos));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if mat:o.data.materials.append(mat)
 if bevel:
  m=o.modifiers.new('Soft manufactured edges','BEVEL');m.width=bevel;m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name)
 new.append(o);return o
# Original ceiling thickness = y5.95..6.10. Cut all the way through it.
# One continuous barrel-vault roof, derived from the user's museum reference.
# The existing timber panels start at |x|=2.725, leaving a true reveal beside it.
glass=plain('Daylight vaulted diffuse glazing',(.69,.80,.85),.35,emission=True)
sky=bpy.data.images.load(str(OUT/'sky/sky-2k.png'));sky.colorspace_settings.name='sRGB';sky.pack()
t=glass.node_tree.nodes.new('ShaderNodeTexImage');t.image=sky;glass.node_tree.links.new(t.outputs['Color'],glass.node_tree.nodes.get('Emission').inputs['Color'])
rooflights=[0]
# The accepted joined wall mesh is intentionally non-manifold at interfaces.
# Never boolean that mesh: Blender can delete remote walls. Replace only the
# main ceiling polygons, using steady warm irradiance for the new surfaces.
# New ceiling faces cannot interpolate across the old atlas islands safely.
# Use uniform warm irradiance plus the runtime's metric mineral grain instead.
reveal_color=(.44,.42,.365);reveal['plasterColorLinear']=reveal_color
ceiling_surround=plaster('vault ceiling surround',reveal_color)
world=[walls.matrix_world@v.co for v in walls.data.vertices];walls.data.calc_loop_triangles()
ceiling_material=next(m for m in walls.data.materials if m.name=='LIGHTMAP hall walls.001')
ci=list(walls.data.materials).index(ceiling_material)
bm=bmesh.new();bm.from_mesh(walls.data)
remove=[f for f in bm.faces if f.material_index==ci and min((walls.matrix_world@v.co).z for v in f.verts)>5.949]
assert len(remove)>0;bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(walls.data);bm.free()
# Four solid strips form a single 5.2 x 14.4 m clear aperture. No side-wall
# geometry is moved, repaired or inferred during this operation.
for pos,size in [((-4.37,6.025,0),(3.54,.15,18)),((4.37,6.025,0),(3.54,.15,18)),((0,6.025,-8.1),(5.2,.15,1.8)),((0,6.025,8.1),(5.2,.15,1.8))]:
 box('Warm seamless ceiling around barrel vault',pos,size,ceiling_surround)
for x in [-2.65,2.65]:
 box('Continuous vaulted plaster curb',(x,6.10,0),(.10,.30,14.6),reveal,.012)
 box('Vault bronze sill',(x*.9849,6.24,0),(.070,.070,14.51),bronze,.006)
 box('Vault dark gasket',(x*.9792,6.285,0),(.018,.022,14.43),gasket)
for z in [-7.25,7.25]:box('Vault end plaster curb',(0,6.10,z),(5.40,.30,.10),reveal,.012)
# Circular barrel section: 5.2 m chord, 1.10 m rise above the curb.
half=2.60;rise=1.10;spring=6.25;radius=(half*half+rise*rise)/(2*rise);cy=spring-(radius-rise);angle=math.asin(half/radius)
def vaultmesh(name,verts,faces,mat,uvs=None):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata([xyz(p) for p in verts],[],faces);mesh.materials.append(mat)
 if uvs is not None:
  layer=mesh.uv_layers.new(name='SkyUV')
  for face in mesh.polygons:
   for li in face.loop_indices:layer.data[li].uv=uvs[mesh.loops[li].vertex_index]
 o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);new.append(o);return o
# Continuous opaque sky-facing glazing is closed at both ends. Curvature and
# its grid supply actual perspective and depth without transparency sorting.
segments=64;rows=12;verts=[];uvs=[];faces=[]
for j in range(rows+1):
 z=-7.20+14.4*j/rows
 for i in range(segments+1):
  a=-angle+2*angle*i/segments;r=radius+.035
  verts.append((math.sin(a)*r,cy+math.cos(a)*r,z));uvs.append((i/segments,j/rows))
for j in range(rows):
 for i in range(segments):
  q=j*(segments+1)+i;faces.append((q,q+1,q+segments+2,q+segments+1))
vaultmesh('Continuous curved glazing',verts,faces,glass,uvs)
# Framed glazed ends: thin sealed glass closes the barrel without a solid
# plaster infill. A triangle fan and consistent normals close both viewpoints.
for z in [-7.23,7.23]:
 arc=[(math.sin(-angle+2*angle*i/segments)*(radius+.045),cy+math.cos(-angle+2*angle*i/segments)*(radius+.045)) for i in range(segments+1)]
 verts=[(0,spring-.06,z+d) for d in [-.012,.012]]
 for d in [-.012,.012]:verts.extend([(x,y,z+d) for x,y in arc])
 faces=[];n=len(arc)
 for i in range(n-1):
  faces.append((0,2+i,3+i));faces.append((1,3+n+i,2+n+i))
  faces.append((2+i,2+n+i,3+n+i,3+i))
 faces.extend([(0,1,2+n,2),(0,2+n-1,2+2*n-1,1)])
 obj=vaultmesh('Sealed glazed vault end',verts,faces,glass,[(p[0]/5.2+.5,(p[1]-spring)/rise) for p in verts])
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(obj.data);bm.free()
 box('Tympanum bronze bottom rail',(0,spring+.015,z),(5.26,.055,.16),bronze,.006)
 for i in range(1,8):
  a=-angle+2*angle*i/8;x=math.sin(a)*radius
  top=cy+math.cos(a)*radius-.005
  box('Tympanum vertical metal mullion',(x,(spring+top)/2,z-math.copysign(.026,z)),(.028,top-spring,.028),bronze,.004)
# Fine metal ribs are proper curved beams, consolidated into one material draw.
for j in range(13):
 z=-7.20+1.20*j;w=.062 if j in [0,12] else .030;verts=[];faces=[]
 for i in range(segments+1):
  a=-angle+2*angle*i/segments
  for dr,dz in [(-.04,-w/2),(.015,-w/2),(.015,w/2),(-.04,w/2)]:verts.append((math.sin(a)*(radius+dr),cy+math.cos(a)*(radius+dr),z+dz))
 for i in range(segments):
  for k in range(4):faces.append((i*4+k,i*4+(k+1)%4,(i+1)*4+(k+1)%4,(i+1)*4+k))
 faces.extend([(3,2,1,0),tuple(range(segments*4,segments*4+4))]);vaultmesh('Vault curved transverse rib',verts,faces,bronze)
for i in range(9):
 a=-angle+2*angle*i/8;box('Vault longitudinal glazing bar',(math.sin(a)*radius,cy+math.cos(a)*radius-.025,0),(.028,.040,14.45),bronze,.004)
# Replace the squared upper silhouette with semicircular intrados. Added only
# above 3.50 m; the traversable opening and all artwork rectangles stay clear.
for side,mat in [(-1,leftmat),(1,rightmat)]:
 for flank in [-1,1]:
  pts=[]
  # Bottom is an arc from the spring point to the apex, top touches existing
  # ceiling of the aperture. Small overlap is buried inside the original wall.
  for i in range(25):
   a=(i/24)*math.pi/2;pts.append((-6.5+flank*1.30*math.cos(a),3.50+1.30*math.sin(a)))
  pts += [(-6.5,4.817),(-6.5+flank*1.30,4.817)]
  verts=[xyz((side*6+d,y,z)) for d in [-.151,.151] for z,y in pts];n=len(pts)
  faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
  mesh=bpy.data.meshes.new('Semicircular alcove spandrel');mesh.from_pydata(verts,[],faces);mesh.materials.append(mat)
  o=bpy.data.objects.new('Rounded alcove upper spandrel',mesh);scene.collection.objects.link(o)
  bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free();new.append(o)
# Continuous grout backing beneath the segmented, previously repaired joints.
# This closes sub-millimetre numerical cracks without widening visible joints.
floor=scene.objects['SURFACE hall floor'];bm=bmesh.new();bm.from_mesh(floor.data)
metric=bm.loops.layers.uv['MetricUV'];lightuv=bm.loops.layers.uv['LightUV']
original_faces=[f for f in bm.faces if f.normal.z>.999 and floor.data.materials[f.material_index].get('surfaceKind')=='mortar']
for f in original_faces:
 center=f.calc_center_median();verts=[]
 for v in f.verts:
  p=v.co.copy();p.x+=math.copysign(.0008,p.x-center.x);p.y+=math.copysign(.0008,p.y-center.y);p.y=max(-9.,min(9.,p.y));p.z-=.0015;verts.append(bm.verts.new(p))
 added=bm.faces.new(verts);added.material_index=f.material_index
 for dst,src in zip(added.loops,f.loops):dst[metric].uv=src[metric].uv;dst[lightuv].uv=src[lightuv].uv
bm.normal_update();bm.to_mesh(floor.data);bm.free();floor.data.update()
# Boolean operands must never shift the original two UV channels.
for uv in list(walls.data.uv_layers):
 if uv.name not in {'MetricUV','LightUV'}:walls.data.uv_layers.remove(uv)
assert [u.name for u in walls.data.uv_layers]==['MetricUV','LightUV']
# Merge additions by material: no one-draw-per-frame-bar penalty.
groups={}
for o in new:groups.setdefault(o.data.materials[0],[]).append(o)
for mat,objs in groups.items():
 select(objs)
 if len(objs)>1:bpy.ops.object.join()
 bpy.context.object.name=mat.name
# Runtime trees are exported separately, as in the accepted builder.
objects=[o for o in scene.objects if not o.get('interiorShadowOnly') and o.type in {'MESH','EMPTY'}]
for name,pos in anchors.items():assert (scene.objects[name].matrix_world.translation-Vector(pos)).length<1e-8
select(objects)
path=ROOT/'public/museum/hall-daylight.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=90,export_vertex_color='NONE',export_texcoords=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'hall-daylight.blend'))
report={'source':'assets/museum/contemporary-experiments/hall/hall-contemporary.blend','asset':'public/museum/hall-daylight.glb','bytes':path.stat().st_size,'rooflights':rooflights,'revealDepthMeters':.30,'version':'vault-6-aligned-sunny-joints','roofWidthMeters':5.2,'roofLengthMeters':14.4,'vaultApexMeters':7.35,'anchorsPreserved':len(anchors),'archLinearTints':[left,right],'originalAssetsUnchanged':True,'runtimeCost':'Opaque glazing. No new shadow maps, world, transmission or animated shader.'}
(OUT/'report.json').write_text(json.dumps(report,indent=2));print('DAYLIGHT_COMPLETE',json.dumps(report),flush=True)
