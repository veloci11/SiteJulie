import { readFile, writeFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Vector3, Raycaster, DoubleSide,Box3 } from 'three';
import sharp from 'sharp';
import {nodeDracoLoader} from './node_draco_loader.mjs';

// Node has no browser ImageBitmap; decode the actual embedded PNG bytes with
// sharp and provide their verified dimensions to Three's geometry-only loader.
// Rendering/color evaluation is deliberately left to the real browser QA.
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{
 const {info}=await sharp(Buffer.from(await blob.arrayBuffer())).raw().toBuffer({resolveWithObject:true});
 assert(info.width<=512 && info.height<=512,'generated texture budget exceeded');
 return {width:info.width,height:info.height,close(){}};
};

const root=new URL('../../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('public/museum/manifest.json',root),'utf8'));
const report=[];
for(const variant of ['hall','extension','outside']) {
 const data=await readFile(new URL(`public/museum/${variant}.glb`,root));
 const buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
 const gltf=await new GLTFLoader().setDRACOLoader(nodeDracoLoader).parseAsync(buffer,'');
 const scene=gltf.scene;scene.updateMatrixWorld(true);
 let meshes=0,triangles=0;const images=new Set();
 scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;o.material.side=DoubleSide;for(const tex of [o.material.map,o.material.normalMap,o.material.roughnessMap])if(tex)images.add(tex.image);assert(o.geometry.attributes.color,'missing baked ambient occlusion');}});
 for(const [name,expected] of Object.entries(manifest.anchors[variant])){
   const node=scene.getObjectByName(`anchor_${name}`);
   assert(node,`${variant}: anchor ${name}`);
   const p=node.getWorldPosition(new Vector3());
   assert(p.distanceTo(new Vector3(...expected))<.00001,`${variant}: incorrect Y-up anchor ${name}: ${p.toArray()}`);
 }
 const clear=(from,to,label)=>{
   const a=new Vector3(...from),b=new Vector3(...to),d=b.clone().sub(a);
   const hits=new Raycaster(a,d.clone().normalize(),.001,d.length()-.001).intersectObject(scene,true);
   assert.equal(hits.length,0,`${variant}: solid geometry across ${label}`);
 };
 // Sweep a 60cm camera volume through each physical doorway, including above/below centre.
 for(const offset of [-.3,0,.3])for(const dy of [-.3,0,.3]){
   if(variant==='outside'){clear([offset,2.2+dy,.05],[offset,2.2+dy,8.5],'terrace arrival');continue;}
   for(const side of [-1,1])clear([side*5,2.2+dy,-6.5+offset],[side*7,2.2+dy,-6.5+offset],'side portal');
   clear([offset,2.2+dy,8],[offset,2.2+dy,10],'front portal');
   if(variant==='extension')clear([offset,2.2+dy,-10],[offset,2.2+dy,-8],'back portal');
   clear([offset,2.2+dy,-7.5],[offset,2.2+dy,7.5],'central circulation lane');
   for(const z of [6,2,-1.5,-4])for(const side of [-1,1])clear([0,2.65+dy,z+offset],[side*5.2,2.65+dy,z+offset],'artwork horizontal approach');
 }
 let maxPlantOffset=0;
 const plantProxies=manifest.obstaclesByModule[variant].filter(o=>o.kind==='plant');
 scene.traverse(o=>{
  if(!o.isMesh||!/(Olive|Travertine planter)/.test(o.material.name))return;
  const positions=o.geometry.attributes.position,p=new Vector3();
  for(let i=0;i<positions.count;i++){
   p.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);
   const nearest=plantProxies.reduce((best,b)=>{const x=(b.min[0]+b.max[0])/2,z=(b.min[2]+b.max[2])/2,d=(p.x-x)**2+(p.z-z)**2;return !best||d<best.d?{b,d}:best;},null).b;
   const dx=Math.abs(p.x-(nearest.min[0]+nearest.max[0])/2),dz=Math.abs(p.z-(nearest.min[2]+nearest.max[2])/2);maxPlantOffset=Math.max(maxPlantOffset,dx,dz);
   assert(p.x>=nearest.min[0]-.005&&p.x<=nearest.max[0]+.005&&p.z>=nearest.min[2]-.005&&p.z<=nearest.max[2]+.005&&p.y<=nearest.max[1]+.005,'vegetation exceeds navigation proxy');
  }
 });
 const floorHits=new Raycaster(new Vector3(0,2,variant==='outside'?1:0),new Vector3(0,-1,0),0,3).intersectObject(scene,true);
 assert(floorHits.length>0,'physical floor missing');
 assert(Math.abs(floorHits[0].point.y)<.04,'floor is not at runtime Y=0');
 assert(meshes<=45,'architecture exceeds batch budget');assert(data.length<8_500_000,'architecture exceeds detailed-model network budget');
 const box=new Box3().setFromObject(scene);
 report.push({variant,bytes:data.length,meshBatches:meshes,triangles,dracoDecoded:true,vertexAmbientOcclusion:true,decodedTextureImages:images.size,anchors:Object.keys(manifest.anchors[variant]).length,portalVolumeSweep:'passed',circulationLaneSweep:'passed',plantProxyCount:plantProxies.length,maxPlantOffset,floorY:floorHits[0].point.y,bounds:{min:box.min.toArray(),max:box.max.toArray()}});
}
await writeFile(new URL('artifacts/museum/export-validation.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
