import {readFile,writeFile} from 'node:fs/promises';
import {strict as assert} from 'node:assert';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3,Vector3} from 'three';
import sharp from 'sharp';
import {nodeDracoLoader} from './node_draco_loader.mjs';
globalThis.self=globalThis;
const textures=[];
globalThis.createImageBitmap=async blob=>{const {info}=await sharp(Buffer.from(await blob.arrayBuffer())).raw().toBuffer({resolveWithObject:true});assert(info.width<=1024&&info.height<=1024);textures.push({width:info.width,height:info.height});return {width:info.width,height:info.height,close(){}};};
const bytes=await readFile('public/museum/fig-detailed.glb');const gltf=await new GLTFLoader().setDRACOLoader(nodeDracoLoader).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const scene=gltf.scene;scene.updateMatrixWorld(true);let triangles=0,radius=0;const batches=[];
scene.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,p=g.attributes.position,n=g.attributes.normal;assert(p&&n&&g.attributes.uv&&g.attributes.color,'position normals UV and per leaf tints must export');assert(o.material.map&&o.material.normalMap);assert.equal(o.material.transparent,false);assert.equal(o.material.side,0,'paired geometric leaves require backface culling');
for(let i=0;i<p.count;i++){const q=new Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);assert(q.toArray().every(Number.isFinite));radius=Math.max(radius,Math.hypot(q.x,q.z));const normal=new Vector3().fromBufferAttribute(n,i);assert(Math.abs(normal.length()-1)<.01,'invalid normals');}
const tris=(g.index?.count??p.count)/3;triangles+=tris;batches.push({name:o.name,triangles:tris,vertices:p.count,material:o.material.name,vertexColors:o.material.vertexColors});});
const bounds=new Box3().setFromObject(scene);assert.equal(batches.length,2);assert(triangles<=70000);assert(radius<=1.10);assert(bounds.min.y>.67&&bounds.min.y<.71);assert(bounds.max.y>4.34&&bounds.max.y<4.36);assert(bytes.length<1_200_000);
const currentTextures=textures.slice();
const report={bytes:bytes.length,triangles,batches,radius,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},textures:currentTextures,decoder:'existing local Draco decoder',validation:'Three GLTFLoader decoded meshes/textures, normals/UV/colors, scale and 70k triangle budget passed'};
await writeFile('artifacts/fig-qa/loader-validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
