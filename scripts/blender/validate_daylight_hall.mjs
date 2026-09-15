import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3,Raycaster,DoubleSide} from 'three';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {nodeDracoLoader} from './node_draco_loader.mjs';
globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>{const {info,data}=await sharp(Buffer.from(await blob.arrayBuffer())).raw().toBuffer({resolveWithObject:true});return {width:info.width,height:info.height,pixelHash:createHash('sha256').update(data).digest('hex'),close(){}};};
const bytes=await readFile('public/museum/hall-daylight.glb');
const scene=(await new GLTFLoader().setDRACOLoader(nodeDracoLoader).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;scene.updateMatrixWorld(true);
let triangles=0,meshes=0;const materials=[];scene.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;o.material.side=DoubleSide;materials.push(o.material.name);if(o.material.name==='LIGHTMAP hall walls'||o.material.name.startsWith('SURFACE ')){assert(o.geometry.attributes.uv&&o.geometry.attributes.uv1,'Original metric UV and irradiance UV preserved');assert(o.material.map);assert.equal(o.material.map.channel,1,'Irradiance must remain on UV1, no boolean UV channel inserted');assert(!o.geometry.attributes.uv2,'No parasite UV channel');}});
scene.traverse(o=>{if(o.isMesh&&o.material.name==='LIGHTMAP daylight vault ceiling surround'){assert.equal(o.material.map,null,'New ceiling must not sample the old fragmented atlas');assert(o.material.userData.plasterColorLinear.every(v=>v>.25&&v<.6),'Warm uniform irradiance');}});
const contract=JSON.parse(await readFile('scripts/blender/contemporary_contract.json'));
for(const [name,p] of Object.entries(contract.anchors.hall)){const node=scene.getObjectByName('anchor_'+name);assert(node,name);assert(node.getWorldPosition(new Vector3()).distanceTo(new Vector3(...p))<.00002);}
const cast=(from,dir,far=3)=>new Raycaster(new Vector3(...from),new Vector3(...dir),.001,far).intersectObject(scene,true);
for(const z of [-6.7,-3.7,.3,3.7,6.7]){
 const hits=cast([.33,5.1,z],[0,1,0]);assert(hits.length>0);assert(hits[0].point.y>7.25,'Real barrel vault apex, no flat glazing at old ceiling height');assert(hits[0].object.material.name.includes('glazing'),'Opaque curved glass closes the roof');
 const side=cast([0,6.10,z],[1,0,0]);assert(Math.abs(side[0].point.x-2.60)<.01,'Continuous raised plaster curb');
}
for(const z of [-1,1])for(const x of [-1.5,0,1.5]) { const h=cast([x,6.55,z*6.8],[0,0,z],1)[0]; assert(h&&['Daylight vaulted diffuse glazing','Daylight brushed champagne frame'].includes(h.object.material.name),'Framed glass seals both vault ends from inside: '+JSON.stringify({x,z,material:h?.object.material.name})); }
const vaultRadius=(2.6*2.6+1.1*1.1)/(2*1.1),vaultAngle=Math.asin(2.6/vaultRadius);
for(let i=1;i<8;i++){const x=Math.sin(-vaultAngle+2*vaultAngle*i/8)*vaultRadius;for(const end of [-1,1]){const h=cast([x,6.4,end*6.8],[0,0,end],1)[0];assert(h?.object.material.name==='Daylight brushed champagne frame','End mullion exactly aligned to roof longitude');}const h=cast([x,5.6,.3],[0,1,0],3)[0];assert(h?.object.material.name==='Daylight brushed champagne frame','Roof longitudinal bar has matching x');}
for(const x of [-.0002,0,.0002])for(const z of [-7.5,-3.5,0,2.5,6.5])assert(cast([x,.08,z],[0,-1,0],.1).length,'Grout underlay closes hairline cracks');
for(const x of [-4,-3,3,4])for(const z of [-8,-4,0,4,8])assert(cast([x,5.1,z],[0,1,0]).length,'Ceiling remains closed outside the vault');
for(const z of [-8,8])assert(cast([0,5.1,z],[0,1,0]).length,'Ceiling end spans remain closed');
const originalBytes=await readFile('public/museum/hall-contemporary.glb');
const original=(await new GLTFLoader().setDRACOLoader(nodeDracoLoader).parseAsync(originalBytes.buffer.slice(originalBytes.byteOffset,originalBytes.byteOffset+originalBytes.byteLength),'')).scene;original.updateMatrixWorld(true);original.traverse(o=>{if(o.isMesh)o.material.side=DoubleSide;});
const originalMaterials=new Map();original.traverse(o=>{if(o.isMesh)originalMaterials.set(o.material.name,o.material);});
scene.traverse(o=>{if(!o.isMesh||!(o.material.name==='LIGHTMAP hall walls'||o.material.name.startsWith('SURFACE ')))return;const before=originalMaterials.get(o.material.name);assert(before);assert.equal(o.material.map.image.pixelHash,before.map.image.pixelHash,'Existing floor/wall/furniture image pixels preserved: '+o.material.name);assert.deepEqual(o.material.userData,before.userData,'Existing material exposure/tint preserved');});
for(const [from,dir] of [[[0,3,-7],[0,0,-1]],[[-5,3,2],[-1,0,0]],[[5,3,2],[1,0,0]],[[-8,3,-7],[0,0,-1]],[[8,3,-7],[0,0,-1]]]){
 const a=cast(from,dir)[0],b=new Raycaster(new Vector3(...from),new Vector3(...dir),.001,3).intersectObject(original,true)[0];assert(a&&b,JSON.stringify({from,dir,newHit:!!a,oldHit:!!b}));assert(a.uv1&&b.uv1);assert(a.uv1.distanceTo(b.uv1)<.0001,'Original wall and alcove irradiance coordinates unchanged');
}
for(const side of [-1,1]){
 assert.equal(cast([side*5,2.2,-6.5],[side,0,0],2).length,0,'Alcoves remain traversable');
 assert.equal(cast([side*5,4.5,-6.5],[side,0,0],2).length,0,'Arch apex remains open');
 assert(cast([side*5,4.5,-7.65],[side,0,0],2).length>0,'Rounded spandrels close upper corners');
}
assert(triangles<80000);assert(bytes.length<1800000);assert(!materials.some(n=>/fig|olive/i.test(n)),'No duplicate runtime tree');
const report={file:'hall-daylight.glb',bytes:bytes.length,triangles,meshes,materials,anchors:'preserved',roofApertures:1,vault:{width:5.2,length:14.4,apex:7.35},irradianceCoordinates:'matched to original at front wall, side walls and alcove interiors',alcoves:'rounded and traversable',ceiling:'closed by opaque glazing; no world required'};
await mkdir('artifacts/daylight',{recursive:true});await writeFile('artifacts/daylight/export-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
