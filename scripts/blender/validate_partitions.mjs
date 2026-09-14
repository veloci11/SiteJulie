/** Actual decoded GLB planes and recesses, without GPU or a browser. */
import {readFile,writeFile} from 'node:fs/promises';
import {strict as assert} from 'node:assert';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3,Raycaster,DoubleSide} from 'three';
import sharp from 'sharp';
import {nodeDracoLoader} from './node_draco_loader.mjs';
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{
 const {data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 return {width:info.width,height:info.height,pixels:data,close(){}};
};
const contract=JSON.parse(await readFile('scripts/blender/contemporary_contract.json'));
const report=[];
const modules=process.argv.includes('--hall-only')?['hall']:process.argv.includes('--current')?['hall','extension-terminal']:['hall','extension','extension-terminal'];
for(const fileStem of modules){
 const module=fileStem==='hall'?'hall':'extension';
 const bytes=await readFile(`public/museum/${fileStem}-contemporary.glb`);
 const scene=(await new GLTFLoader().setDRACOLoader(nodeDracoLoader).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 scene.updateMatrixWorld(true);const meshes=[];
 scene.traverse(o=>{if(o.isMesh){o.material.side=DoubleSide;meshes.push(o);}});
 const planes=[];
 for(const part of contract.partitionsByModule[module]){
  const [x,,z]=part.position;const [,height,depth]=part.size;
  const ray=y=>new Raycaster(new Vector3(x,y,z+.8),new Vector3(0,0,-1),0,1.5).intersectObjects(meshes,false)[0];
  const front=ray(.5);assert(front,`${fileStem}: missing partition ${part.name}`);
  assert(Math.abs(front.point.z-(z+depth/2))<.002,`${part.name}: unexpected front plane`);
  const foot=ray(.009);assert(foot&&Math.abs(foot.face.normal.y)<.001,`${part.name}: downward bevel exposed at the floor`);
  const image=foot.object.material.map.image,uv=foot.uv1;
  const px=Math.min(image.width-1,Math.max(0,Math.floor(uv.x*image.width))),py=Math.min(image.height-1,Math.max(0,Math.floor(uv.y*image.height)));
  const footRGB=[0,1,2].map(c=>image.pixels[(py*image.width+px)*4+c]);
  assert(Math.min(...footRGB)>0,`${part.name}: black irradiance texel at floor contact`);
  let recess=null;
  if(part.style.endsWith('niche')){
   const hit=ray(1.75);assert(hit,`${part.name}: missing solid recess backing`);
   recess=front.point.z-hit.point.z;assert(recess>.12&&recess<.20,`${part.name}: niche is not a real recess`);
  }
  for(const [name,p] of Object.entries(contract.anchors[module])){
   if(!name.startsWith('slot_')||Math.abs(p[0])<5)continue;
   if(Math.sign(p[0])!==Math.sign(x))continue;
   // Full 2.47m frame envelope along a side wall remains clear of the return.
   assert(Math.abs(p[2]-z)>1.235+depth/2,`${part.name} crosses ${name} artwork bay`);
  }
  planes.push({name:part.name,frontZ:front.point.z,recessMeters:recess,footNormal:foot.face.normal.toArray(),footRGB,artworkBaysClear:true});
 }
 report.push({module:fileStem,planes});
}
await writeFile('artifacts/museum/partition-planes-validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
