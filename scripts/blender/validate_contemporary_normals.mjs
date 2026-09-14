import {readFile,writeFile} from 'node:fs/promises';import {strict as assert} from 'node:assert';import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {Vector3} from 'three';import {nodeDracoLoader} from './node_draco_loader.mjs';
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:2048,height:2048,close(){}});
const root=new URL('../../',import.meta.url),results=[],contract=JSON.parse(await readFile(new URL('scripts/blender/contemporary_contract.json',root)));
for(const fileStem of ['hall','extension','extension-terminal']){
 const stem=fileStem==='hall'?'hall':'extension';
 const bytes=await readFile(new URL(`public/museum/${fileStem}-contemporary.glb`,root));const scene=(await new GLTFLoader().setDRACOLoader(nodeDracoLoader).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;scene.updateMatrixWorld(true);
 const samples={pot:[],vessel:[]},tree=contract.treesByModule[stem][0];
 scene.traverse(o=>{if(!o.isMesh)return;const kind=o.material.userData.surfaceKind;if(!['stone','ceramic'].includes(kind))return;const pos=o.geometry.attributes.position,normal=o.geometry.attributes.normal;
  for(let i=0;i<pos.count;i++){
   const p=new Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld),n=new Vector3().fromBufferAttribute(normal,i).transformDirection(o.matrixWorld),sign=Math.sign(p.x);
   const r=new Vector3(p.x-(kind==='stone'?tree.position[0]:sign*9.65),0,p.z-(kind==='stone'?tree.position[2]:-6));const radius=r.length();
   if(kind==='stone'&&p.y>.06&&p.y<tree.potHeight-.03&&radius>tree.potRadius*.98&&radius<tree.potRadius*1.02)samples.pot.push(n.dot(r.normalize()));
   if(kind==='ceramic'&&p.y>1.17&&p.y<1.29&&radius>.113&&radius<.125)samples.vessel.push(n.dot(r.normalize()));
  }
 });
 for(const [kind,values] of Object.entries(samples)){assert(values.length>16,`No ${kind} outer ring found`);assert(values.every(n=>n>.50),`${kind} still has inward-facing outer normals`);}
 results.push({stem:fileStem,...Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,{sampledVertices:v.length,meanOutwardDot:v.reduce((a,b)=>a+b,0)/v.length,minimumOutwardDot:Math.min(...v)}]))});
}
const hashes=process.argv.includes('--check-preserved-atlases')?JSON.parse(await readFile(new URL('artifacts/museum/furniture-preserved-atlases.json',root))):{};
for(const [path,expected] of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile(new URL(path,root))).digest('hex'),expected,`Preserved atlas changed: ${path}`);
await writeFile(new URL('artifacts/museum/outward-normals-validation.json',root),JSON.stringify({results,preservedAtlasHashes:hashes},null,2));console.log(results);
