import {readFile,writeFile} from 'node:fs/promises';
import {strict as assert} from 'node:assert';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
import {nodeDracoLoader} from './node_draco_loader.mjs';
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:2048,height:2048,close(){}});
const root=new URL('../../',import.meta.url),results=[];
for(const fileStem of ['hall','extension','extension-terminal']){
 const stem=fileStem==='hall'?'hall':'extension';
 const b=await readFile(new URL(`public/museum/${fileStem}-contemporary.glb`,root));
 const scene=(await new GLTFLoader().setDRACOLoader(nodeDracoLoader).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;scene.updateMatrixWorld(true);
 let conflictingFaces=0,dadoY=[];
 scene.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position,idx=o.geometry.index;
  for(let i=0;i<idx.count;i+=3){
   const v=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,idx.getX(i+k)).applyMatrix4(o.matrixWorld).add(new Vector3(0,0,stem==='extension'?18:0)));
   if(v.every(v=>Math.abs(v.z-8.85)<.0001)&&Math.max(...v.map(v=>v.y))>5.7&&Math.min(...v.map(v=>v.y))<5.84)conflictingFaces++;
   if(stem==='hall'&&o.material.userData.surfaceKind==='wood'&&v.every(v=>v.z> -8.86&&v.z< -8.75&&v.y<1.5&&Math.abs(v.x)<4.5))dadoY.push(...v.map(v=>v.y));
  }
 });
 if(stem==='extension')assert.equal(conflictingFaces,0,'Extension ceiling still has faces on the visible hall wall plane');
 else{assert(conflictingFaces>0,'Expected real hall wall remains');assert(dadoY.length>0);assert(Math.abs(Math.max(...dadoY)-.72)<.0001,'Dado still obscures lower artwork caption');}
 results.push({stem:fileStem,facesOnVisibleHallWallPlane:conflictingFaces,dadoTopY:dadoY.length?Math.max(...dadoY):null,captionBottomY:.805,captionClearance:dadoY.length?.805-Math.max(...dadoY):null});
}
await writeFile(new URL('artifacts/museum/junction-after.json',root),JSON.stringify(results,null,2));console.log(results);
