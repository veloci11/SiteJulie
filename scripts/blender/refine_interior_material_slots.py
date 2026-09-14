"""Restore exact authored tint variants after deduplication; CPU-only, no rebake."""
import bpy,sys,ast,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];STEM=sys.argv[sys.argv.index('--')+1];color=(.73,.65,.53) if STEM=='hall' else (.70,.60,.47)
module=ast.parse((ROOT/'scripts/blender/build_interior_rooms.py').read_text());definition=next(n for n in module.body if isinstance(n,ast.FunctionDef) and n.name=='specification');exec(compile(ast.Module(body=[definition],type_ignores=[]),'<material specification>','exec'))
def facekey(obj,p):return tuple(sorted(tuple(round(v,4) for v in obj.matrix_world@obj.data.vertices[i].co) for i in p.vertices))
private=ROOT/'assets/museum/interior-experiments'/STEM
bpy.ops.wm.open_mainfile(filepath=str(private/(STEM+'-interior-pbr.blend')))
lookup={}
for obj in bpy.context.scene.objects:
 if obj.type!='MESH' or obj.get('interiorShadowOnly'):continue
 name=obj.data.materials[0].name
 if 'lamp diffuser' in name.lower():continue
 spec=specification(name)
 for p in obj.data.polygons:lookup[facekey(obj,p)]=spec
bpy.ops.wm.open_mainfile(filepath=str(private/(STEM+'-interior.blend')))
restored=0
for obj in bpy.context.scene.objects:
 if obj.type!='MESH' or not obj.name.startswith('SURFACE '):continue
 candidates=[m for m in bpy.data.materials if m.name.startswith('SURFACE '+STEM+' ') and m.node_tree.nodes.get('Principled BSDF')]
 def keymat(m):return(m['surfaceKind'],tuple(m['surfaceColorLinear']),m['surfacePeriodMeters'],m['surfaceRoughness'],m['surfaceNormalStrength'])
 matlookup={keymat(m):m for m in candidates if next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE').image.name.find('floor' if 'floor' in obj.name else 'furniture')>=0}
 mats=[];indices=[]
 for p in obj.data.polygons:
  spec=lookup.get(facekey(obj,p));assert spec,('Unmatched source face',obj.name,p.index)
  _,kind,tint,period,rough,strength=spec
  match=next((m for k,m in matlookup.items() if k[0]==kind and all(abs(a-b)<1e-5 for a,b in zip(k[1],tint)) and abs(k[2]-period)<1e-5 and abs(k[3]-rough)<1e-5 and abs(k[4]-strength)<1e-5),None)
  if match is None:
   template=next(m for k,m in matlookup.items() if k[0]==kind);match=template.copy();match.name='SURFACE '+STEM+' '+kind+' authored tint '+str(len(matlookup));match['surfaceColorLinear']=list(tint);match['surfacePeriodMeters']=period;match['surfaceRoughness']=rough;match['surfaceNormalStrength']=strength;matlookup[keymat(match)]=match
  if match not in mats:mats.append(match)
  indices.append(mats.index(match))
 obj.data.materials.clear()
 for m in mats:obj.data.materials.append(m)
 for p,i in zip(obj.data.polygons,indices):p.material_index=i
 restored+=len(mats)
objects=[o for o in bpy.context.scene.objects if o.name!='Terminal plaster closure' and not o.get('interiorShadowOnly') and o.type in {'MESH','EMPTY'}]
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
path=ROOT/'public/museum'/(STEM+'-interior.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=90,export_vertex_color='NONE',export_texcoords=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
bpy.ops.wm.save_as_mainfile(filepath=str(private/(STEM+'-interior.blend')))
p=ROOT/'public/museum/interior'/(STEM+'-report.json');report=json.loads(p.read_text());report['bytes']=path.stat().st_size;report['distinctSurfaceMaterials']=restored;p.write_text(json.dumps(report,indent=2));print('MATERIAL_TINT_VARIANTS',STEM,restored,path.stat().st_size)
