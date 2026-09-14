import {readFile,writeFile} from 'node:fs/promises';
import {strict as assert} from 'node:assert';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3,Raycaster,DoubleSide,Box3} from 'three';
import sharp from 'sharp';
import {nodeDracoLoader} from './node_draco_loader.mjs';
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{
 const {info}=await sharp(Buffer.from(await blob.arrayBuffer())).raw().toBuffer({resolveWithObject:true});
 assert(info.width<=4096&&info.height<=4096);
 return {width:info.width,height:info.height,close(){}};
};
const root=new URL('../../',import.meta.url),stem=process.argv[2]||'hall';
const manifest=JSON.parse(await readFile(new URL('public/museum/manifest.json',root)));
const data=await readFile(new URL(`public/museum/${stem}-baked.glb`,root));
const scene=(await new GLTFLoader().setDRACOLoader(nodeDracoLoader).parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')).scene;
scene.updateMatrixWorld(true);
let triangles=0,meshes=0;const materials=[];
scene.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;o.material.side=DoubleSide;
 assert(!o.geometry.attributes.color,'unexpected previous sparse AO');
 materials.push({name:o.material.name,radianceScale:o.material.userData.bakeRadianceScale,texture:o.material.map?.image&&[o.material.map.image.width,o.material.map.image.height]});
});
for(const [name,expected] of Object.entries(manifest.anchors[stem])){
 const node=scene.getObjectByName(`anchor_${name}`);assert(node);assert(node.getWorldPosition(new Vector3()).distanceTo(new Vector3(...expected))<.00001);
}
const clear=(from,to)=>{const a=new Vector3(...from),b=new Vector3(...to),d=b.clone().sub(a);assert.equal(new Raycaster(a,d.clone().normalize(),.001,d.length()-.001).intersectObject(scene,true).length,0);};
for(const dx of [-.3,0,.3])for(const dy of [-.3,0,.3]){
 if(stem==='outside'){clear([dx,2.2+dy,.05],[dx,2.2+dy,8.5]);continue;}
 clear([dx,2.2+dy,-7.5],[dx,2.2+dy,10]);
 for(const s of [-1,1])clear([s*5,2.2+dy,-6.5+dx],[s*7,2.2+dy,-6.5+dx]);
 for(const z of [6,2,-1.5,-4])for(const s of [-1,1])clear([0,2.65+dy,z+dx],[s*5.2,2.65+dy,z+dx]);
}
const box=new Box3().setFromObject(scene);
const floor=new Raycaster(new Vector3(0,2,stem==='outside'?1:0),new Vector3(0,-1,0),0,3).intersectObject(scene,true);
assert(floor.length&&Math.abs(floor[0].point.y)<.04,'physical floor moved');
const original=await readFile(new URL(`public/museum/${stem}.glb`,root));
const originalScene=(await new GLTFLoader().setDRACOLoader(nodeDracoLoader).parseAsync(original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength),'')).scene;
const excluded=stem==='outside'?['Coastal limestone','Distant warm island']:[];
let expectedTriangles=0;originalScene.traverse(o=>{if(o.isMesh&&!excluded.includes(o.material.name))expectedTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
assert.equal(triangles,expectedTriangles,'retained geometry triangle count changed');
for(const m of materials)assert(!excluded.includes(m.name),'excluded landscape is still exported');
const report={stem,bytes:data.length,meshes,triangles,materials,anchorsVerified:true,retainedTriangleCountVerified:true,excludedMaterials:excluded,floorY:floor[0].point.y,portalAndCameraSweeps:'passed',bounds:{min:box.min.toArray(),max:box.max.toArray()}};
await writeFile(new URL(`artifacts/museum/${stem}-bake-validation.json`,root),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
