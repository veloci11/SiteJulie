/** Read-only decoded geometry and irradiance diagnosis; no rendering. */
import {readFile,writeFile} from 'node:fs/promises';
import {strict as assert} from 'node:assert';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3,Raycaster,DoubleSide} from 'three';
import sharp from 'sharp';import {nodeDracoLoader} from './node_draco_loader.mjs';
globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>{const {data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {width:info.width,height:info.height,pixels:data,close(){}};};
const stem=process.argv[2]??'hall';const bytes=await readFile(`public/museum/${stem}-contemporary.glb`);const scene=(await new GLTFLoader().setDRACOLoader(nodeDracoLoader).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;scene.updateMatrixWorld(true);const walls=[],floors=[];
scene.traverse(o=>{if(!o.isMesh)return;o.material.side=DoubleSide;if(o.material.name.startsWith('LIGHTMAP')||o.material.userData.wallDetailsOnly)walls.push(o);if(o.material.name.includes('floor')||o.material.userData.surfaceKind==='mortar'||o.material.userData.surfaceKind==='stone')floors.push(o);});
function sample(hit){if(!hit)return null;const m=hit.object.material;let rgb=null,uv=hit.uv1;if(uv&&m.map?.image?.pixels){const im=m.map.image;const x=Math.max(0,Math.min(im.width-1,Math.floor(uv.x*im.width)));const y=Math.max(0,Math.min(im.height-1,Math.floor(uv.y*im.height)));rgb=[0,1,2].map(k=>im.pixels[(y*im.width+x)*4+k]);}return {p:hit.point.toArray(),normal:hit.face.normal.toArray(),material:m.name,rgb,uv:uv?.toArray()};}
const side=[];for(const y of [.002,.0065,.009,.015,.022,.035,.06])for(const z of [0,.125,.45,1.15])side.push({y,z,hit:sample(new Raycaster(new Vector3(-5.80,y,z),new Vector3(-1,0,0),0,.4).intersectObjects(walls,false)[0])});
const floor=[];for(const x of [-5.7,-5.82,-5.85,-5.86,-5.875,-5.90])for(const z of [0,.125,.45,1.15])floor.push({x,z,hits:new Raycaster(new Vector3(x,.2,z),new Vector3(0,-1,0),0,.3).intersectObjects(floors,false).slice(0,4).map(sample)});
const report={stem,side,floor};await writeFile(`artifacts/museum/${stem}-floor-contact-diagnosis.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({side:side.filter(v=>v.z===.125),floor:floor.filter(v=>v.z===.125)},null,2));
if(stem==='hall'){
 let before;
 try{before=JSON.parse(await readFile('artifacts/museum/hall-floor-contact-before-reading.json'));}
 catch(error){if(error.code!=='ENOENT')throw error;}
 if(before){
  // The tiled walking surface is Y=.0065: samples below it are buried, invisible.
  const samples=before.side.filter(s=>s.y>=.0065&&s.hit?.rgb?.every(c=>c===0)).map(old=>{
   const next=side.find(s=>s.y===old.y&&s.z===old.z)?.hit;
   assert(next&&Math.min(...next.rgb)>0&&Math.abs(next.normal[1])<1e-5,`Unresolved wall-foot sample ${old.y},${old.z}`);
   return {y:old.y,z:old.z,before:{normal:old.hit.normal,rgb:old.hit.rgb},after:{normal:next.normal,rgb:next.rgb}};
  });
  assert(samples.length>0,'Baseline contains no black contact samples');
  await writeFile('artifacts/museum/floor-contact-comparison.json',JSON.stringify({method:'Actual Draco-decoded GLB rays and decoded irradiance texels; no screenshot colour sampling.',blackSamplesCorrected:samples.length,samples},null,2)+'\n');
 }
}
