"""Read-only comparison against the accepted V6 sources before relief removal."""
import bpy, json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def inspect(path):
 bpy.ops.wm.open_mainfile(filepath=str(path))
 signatures={}
 forbidden=[]
 for o in bpy.context.scene.objects:
  if any(s in o.name for s in ['Low warm entrance relief','Shallow rose ceramic relief']):forbidden.append(o.name)
  if o.type!='MESH':continue
  if not o.name.startswith('Floor to ceiling walnut insert'):continue
  payload={'vertices':[list(v.co) for v in o.data.vertices],'polygons':[list(p.vertices) for p in o.data.polygons],'transform':[list(row) for row in o.matrix_world]}
  signatures[o.name]=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
 return signatures,forbidden
report=[]
for stem in ['hall','extension','extension-terminal']:
 old,previous=inspect(ROOT/'assets/museum/contemporary-before-relief-removal'/stem/(stem+'-contemporary-pbr.blend'))
 new,remaining=inspect(ROOT/'assets/museum/contemporary-experiments'/stem/(stem+'-contemporary-pbr.blend'))
 assert len(old)==4 and old==new,(stem,'Accepted walnut geometry changed')
 assert previous and not remaining,(stem,'Rejected relief objects or lights remain')
 report.append({'module':stem,'walnutObjectsUnchanged':4,'removedObjectsAndLights':previous,'remainingRejectedObjects':remaining,'walnutSHA256':new})
(ROOT/'artifacts/museum/walnut-preservation.json').write_text(json.dumps(report,indent=2)+'\n')
print('WALNUT_PRESERVATION_PASSED',json.dumps(report))
