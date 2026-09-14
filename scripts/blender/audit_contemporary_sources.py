"""Read-only source audit plus tiny in-memory generator tests; no bake/render/export."""
import bpy,bmesh,ast,math,json,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];CONTRACT=json.loads((ROOT/'scripts/blender/contemporary_contract.json').read_text());source=ROOT/'scripts/blender/build_contemporary_rooms.py';tree=ast.parse(source.read_text())
files=list((ROOT/'public/museum').glob('*-contemporary.glb'))+list((ROOT/'public/museum').glob('fig-*.glb'))
before={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;height=5.95
stone=bpy.data.materials.new('audit stone');ceilingmat=stone;wood=stone
for node in tree.body:
 if isinstance(node,ast.FunctionDef) and node.name in ['xyz','box','pot','vessel']:exec(compile(ast.Module(body=[node],type_ignores=[]),str(source),'exec'))
def bounds(o):
 pts=[o.matrix_world@v.co for v in o.data.vertices];pts=[(p.x,p.z,-p.y) for p in pts]
 return {'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]}
def outward(o,x,z,lo,hi,rlo,rhi):
 o.data.update();values=[]
 for p in o.data.polygons:
  c=o.matrix_world@p.center;r=Vector((c.x-x,c.y+z,0));n=o.matrix_world.to_3x3()@p.normal
  if lo<c.z<hi and rlo<r.length<rhi:values.append(n.normalized().dot(r.normalized()))
 assert len(values)>=32,(o.name,len(values));assert min(values)>.7,(o.name,min(values))
 return {'faces':len(values),'minimumRadialDot':min(values)}
# Execute the actual builder AST statements for its ceiling and low wood panel.
for node in ast.walk(tree):
 if isinstance(node,ast.Call) and node.args and isinstance(node.args[0],ast.Constant) and node.args[0].value in ['Continuous contemporary ceiling','Portrait gallery low walnut dado']:
  exec(compile(ast.fix_missing_locations(ast.Module(body=[ast.Expr(value=node)],type_ignores=[])),str(source),'exec'))
ceiling=bounds(scene.objects['Continuous contemporary ceiling']);dado=bounds(scene.objects['Portrait gallery low walnut dado'])
assert abs(ceiling['min'][2]+9)<1e-5 and abs(ceiling['max'][2]-9)<1e-5
assert abs(dado['max'][1]-.72)<1e-5
pot(4.7,4.35,.46,.74);potproof=outward(scene.objects['Tapered mineral pot'],4.7,4.35,.06,.68,.38,.47)
vessel('audit vessel',9.65,1.13,-6,.5,stone);vaseproof=outward(scene.objects['audit vessel'],9.65,-6,1.18,1.31,.110,.13)
report={'blender':bpy.app.version_string,'bakeExecuted':False,'renderExecuted':False,'GLBExportExecuted':False,'builderSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'builderGeometrySmoke':{'ceiling':ceiling,'dado':dado,'pot':potproof,'vessel':vaseproof},'sources':[]}
for file_stem in ['hall','extension','extension-terminal']:
 stem='hall' if file_stem=='hall' else 'extension'
 physical=ROOT/'assets/museum/contemporary-experiments'/file_stem/(file_stem+'-contemporary-pbr.blend');bpy.ops.wm.open_mainfile(filepath=str(physical));scene=bpy.context.scene
 tree_hashes=json.loads(scene.get('treeAssetSHA256','{}'));assert len(tree_hashes)==len(CONTRACT['treesByModule'][stem]),'Missing baked tree provenance'
 for path,expected in tree_hashes.items():
  assert hashlib.sha256((ROOT/('public'+path)).read_bytes()).hexdigest()==expected,('Baked tree differs from final runtime tree',path)

 for name,p in CONTRACT['anchors'][stem].items():
  anchor=scene.objects.get('anchor_'+name);assert anchor is not None;assert (anchor.matrix_world.translation-Vector(xyz(p))).length<1e-5
 b=bounds(scene.objects['Continuous contemporary ceiling']);assert abs(b['min'][2]+9)<1e-5 and abs(b['max'][2]-9)<1e-5
 if stem=='hall':assert abs(bounds(scene.objects['Portrait gallery low walnut dado'])['max'][1]-.72)<1e-5
 pottery=[o for o in scene.objects if o.name.startswith('Tapered mineral pot')];vases=[o for o in scene.objects if o.name.startswith('Hand thrown editorial vessel')];assert len(pottery)==1 and len(vases)==2
 for o in pottery:
  b0=bounds(o);x=(b0['min'][0]+b0['max'][0])/2;t=CONTRACT['treesByModule'][stem][0];outward(o,x,t['position'][2],.06,t['potHeight']-.06,t['potRadius']*.82,t['potRadius']*1.02)
 for o in vases:
  b0=bounds(o);x=(b0['min'][0]+b0['max'][0])/2;outward(o,x,-6,1.18,1.31,.110,.13)
 niches=[]
 for part in CONTRACT.get('partitionsByModule',{}).get(stem,[]):
  if not part['style'].endswith('niche'):continue
  o=scene.objects.get(part['name']+' continuous recess');assert o is not None
  bm=bmesh.new();bm.from_mesh(o.data);assert all(e.is_manifold for e in bm.edges),'Open or duplicate niche boundary'
  volume=bm.calc_volume(signed=True);assert volume>0,'Inverted niche wall';bm.free()
  niches.append({'name':part['name'],'watertight':True,'positiveVolume':volume,'bounds':bounds(o)})
 shallow=[];boxes=CONTRACT.get('wallDetailsByModule',{}).get(stem,[])
 for o in scene.objects:
  if o.type!='MESH' or not o.data.materials or not all(m.get('wallDetailsOnly') for m in o.data.materials):continue
  for v in o.data.vertices:
   point=o.matrix_world@v.co;p=(point.x,point.z,-point.y)
   assert any(all(abs(p[i]-d['position'][i])<=d['size'][i]/2+.00002 for i in range(3)) for d in boxes),(o.name,p)
  shallow.append({'name':o.name,'bounds':bounds(o)})
 if boxes:assert shallow,'Missing shallow details in saved physical source'
 report['sources'].append({'module':file_stem,'physicalSource':str(physical.relative_to(ROOT)),'closedCeilingBounds':b,'outwardLatheObjects':3,'continuousNiches':niches,'shallowWallObjects':shallow,'bakedTreeSHA256':tree_hashes})
 final=physical.with_name(file_stem+'-contemporary.blend');bpy.ops.wm.open_mainfile(filepath=str(final));obj=bpy.data.objects['SURFACE '+stem+' furniture'];assert obj.data.uv_layers.get('MetricUV') and obj.data.uv_layers.get('LightUV')
 report['sources'][-1]['exportSource']=str(final.relative_to(ROOT));report['sources'][-1]['UV0AndUV1']=True
for variant in ['reading','central']:
 provenance=json.loads((ROOT/('assets/museum/trees/fig-'+variant+'/provenance.json')).read_text())
 for f in provenance['files']:
  p=ROOT/f['path'];assert p.stat().st_size==f['bytes'];assert hashlib.sha256(p.read_bytes()).hexdigest()==f['sha256'],f['path']
report['figProvenanceHashes']='all passed';report['GLBHashes']=before
assert before=={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files},'Audit modified an asset'
(ROOT/'artifacts/museum/contemporary-reproducibility.json').write_text(json.dumps(report,indent=2));print('REPRODUCIBILITY_AUDIT',json.dumps(report),flush=True)
