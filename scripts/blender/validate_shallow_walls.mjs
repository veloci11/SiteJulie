/** Decode actual new wall details and prove every exported vertex fits its box. */
import {readFile,writeFile} from 'node:fs/promises';
import {strict as assert} from 'node:assert';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3,Raycaster,DoubleSide} from 'three';
import {nodeDracoLoader} from './node_draco_loader.mjs';
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:2048,height:2048,close(){}});
const contract=JSON.parse(await readFile('scripts/blender/contemporary_contract.json'));
const runtimeConfig=await readFile('lib/museum/config.ts','utf8');
const constant=name=>{const match=runtimeConfig.match(new RegExp(`export const ${name} = ([0-9.]+)`));assert(match,`Missing actual runtime constant ${name}`);return Number(match[1]);};
const paintingFrontAbsX=Math.abs(contract.anchors.hall.slot_02[0])-constant('ARTWORK_WALL_CLEARANCE')-constant('ARTWORK_IMAGE_DEPTH');
const report=[];
const names=process.argv.includes('--hall-only')?['hall']:['hall','extension','extension-terminal'];
for(const stem of names){
 const module=stem==='hall'?'hall':'extension',details=contract.wallDetailsByModule[module];
 assert.equal(contract.partitionsByModule[module].length,0,'Old return configuration remains active');
 const bytes=await readFile(`public/museum/${stem}-contemporary.glb`);
 const scene=(await new GLTFLoader().setDRACOLoader(nodeDracoLoader).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 scene.updateMatrixWorld(true);const point=new Vector3(),meshes=[];let vertices=0,tagged=0,minX=Infinity;
 const actualBounds=details.map(d=>({name:d.name,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}));
 scene.traverse(o=>{
  if(!o.isMesh)return;o.material.side=DoubleSide;meshes.push(o);
  if(!o.material.userData.wallDetailsOnly)return;tagged++;
  const positions=o.geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
   point.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);const p=point.toArray();
   const detailIndex=details.findIndex(d=>p.every((v,k)=>Math.abs(v-d.position[k])<=d.size[k]/2+.0001));
   assert(detailIndex>=0,`${stem}: exported detail outside approved AABB ${p}`);
   p.forEach((v,k)=>{actualBounds[detailIndex].min[k]=Math.min(actualBounds[detailIndex].min[k],v);actualBounds[detailIndex].max[k]=Math.max(actualBounds[detailIndex].max[k],v);});
   assert(Math.abs(p[0])>=5.785-.0001,`${stem}: relief protrudes towards paintings`);
   minX=Math.min(minX,Math.abs(p[0]));vertices++;
  }
 });
 assert(tagged>0&&vertices>0,'No independently identifiable exported shallow wall geometry');
 details.forEach((d,i)=>{
  assert(actualBounds[i].min[1]<=d.position[1]-d.size[1]/2+.01&&actualBounds[i].max[1]>=d.position[1]+d.size[1]/2-.01,`${stem}: ${d.name} does not span its intended height`);
 });
 // Clear the four former oblique-view blockers at torso/painting height.
 for(const x of [-4.4,4.4])for(const z of [.25,4.25])for(const y of [1.2,1.8,2.05]){
  const hits=new Raycaster(new Vector3(x,y,z-.4),new Vector3(0,0,1),0,.8).intersectObjects(meshes,false);
  assert.equal(hits.length,0,`${stem}: former perpendicular return remains at ${x},${y},${z}`);
 }
 // Former right-side mineral/ceramic additions must now expose the original flat wall.
 const formerZ=module==='hall'?4:.25,formerY=module==='hall'?.93:1.475;
 let bareWallSamples=0;
 for(const dz of [-.2,0,.2])for(const dy of [-.25,0,.25]){
  const hit=new Raycaster(new Vector3(5,formerY+dy,formerZ+dz),new Vector3(1,0,0),0,1.1).intersectObjects(meshes,false)[0];
  assert(hit&&Math.abs(hit.point.x-5.85)<.001,`${stem}: removed wall relief still projects at ${formerY+dy},${formerZ+dz}`);
  assert(hit.object.material.name.startsWith('LIGHTMAP')&&!hit.object.material.userData.wallDetailsOnly,`${stem}: former detail still covers original plaster`);
  bareWallSamples++;
 }
 assert(minX-paintingFrontAbsX>.05,'Shallow detail passes the actual runtime painting surface');
 report.push({module:stem,taggedMeshes:tagged,verifiedVertices:vertices,minimumAbsX:minX,paintingFrontAbsX,minimumClearanceMeters:minX-paintingFrontAbsX,actualBounds,bareWallSamples,oldReturnRaysClear:12});
}
await writeFile('artifacts/museum/shallow-walls-glb-validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
