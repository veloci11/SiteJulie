import {readFile,writeFile} from 'node:fs/promises';
import {strict as assert} from 'node:assert';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3,Raycaster,DoubleSide,Box3} from 'three';
import sharp from 'sharp';
import {nodeDracoLoader} from './node_draco_loader.mjs';
globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>{const {info}=await sharp(Buffer.from(await blob.arrayBuffer())).raw().toBuffer({resolveWithObject:true});assert(info.width<=2048&&info.height<=2048);return {width:info.width,height:info.height,close(){}};};
const root=new URL('../../',import.meta.url),manifest=JSON.parse(await readFile(new URL('public/museum/manifest.json',root))),variant='contemporary';
async function load(name){const bytes=await readFile(new URL(`public/museum/${name}.glb`,root));const scene=(await new GLTFLoader().setDRACOLoader(nodeDracoLoader).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;scene.updateMatrixWorld(true);return {scene,bytes:bytes.length};}
const results=[];
const figs={hall:await load('fig-reading'),extension:await load('fig-central')};
for(const fileStem of (process.argv.includes('--current')?['hall','extension-terminal']:['hall','extension','extension-terminal'])){
 const stem=fileStem==='hall'?'hall':'extension';const terminal=fileStem.endsWith('-terminal');
 const {scene,bytes}=await load(fileStem+'-'+variant);let triangles=0,meshes=0;const materials=[];
 scene.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;o.material.side=DoubleSide;
  const m=o.material;if(m.name.startsWith('LIGHTMAP ')||m.name.startsWith('SURFACE ')){assert.equal(m.map.channel,1);assert(o.geometry.attributes.uv&&o.geometry.attributes.uv1);assert(m.userData.lightmapRadianceScale>0);assert.equal((m.userData.plasterColorLinear||m.userData.surfaceColorLinear).length,3);if(m.name.startsWith('SURFACE ')){assert(m.userData.surfacePeriodMeters>0);assert(m.userData.surfaceRoughness>=0);}assert(!m.normalMap);}
  materials.push({name:m.name,texture:m.map&&[m.map.image.width,m.map.image.height],channel:m.map?.channel,extras:m.userData});
 });
 const authored=JSON.parse(await readFile(new URL(`public/museum/contemporary/${fileStem}-report.json`,root)));
 const removed=authored.refinement?.internalFacesRemoved??0;
 assert.equal(authored.trees.length,1,'One large fig per distinct room composition');
 const treeBounds=authored.trees.map(t=>{
  const tree=figs[stem].scene.clone(true);tree.position.fromArray(t.position);tree.scale.setScalar(t.scale);tree.rotation.y=t.rotationY;tree.updateMatrixWorld(true);
  const b=new Box3().setFromObject(tree,true);
  assert(b.min.x> -5.85&&b.max.x<5.85,'Fig intersects gallery wall');
  if(stem==='hall')assert(b.min.z>3.2,'Lateral fig approaches side artwork');
  else assert(b.min.x> -1&&b.max.x<2&&b.min.z> -3&&b.max.z<.1,'Central fig outside agreed zone');
  assert(b.max.y>4.1&&b.max.y<4.4,'Mature fig height incorrect');
  assert(t.potHeight<=.76&&t.potRadius<=.48,'Pot remains oversized');
  return {min:b.min.toArray(),max:b.max.toArray()};
 });
 assert(triangles<(stem==='hall'?90000:110000),'Old trees appear to remain embedded');
 assert.equal(authored.floorBevelUV.tileCount,stem==='hall'?225:396);
 assert.equal(authored.floorBevelUV.insetMeters,.035);
 assert.equal(authored.mortarUV.cells,stem==='hall'?225:396);
 const mortar=[];scene.traverse(o=>{if(o.isMesh&&o.material.userData.surfaceKind==='mortar')mortar.push(o);});
 for(let x=-6;x<=6;x+=.5)for(let z=-9;z<=9;z+=.5){
  const hits=new Raycaster(new Vector3(x,1,z),new Vector3(0,-1,0),0,2).intersectObjects(mortar,false);
  assert(hits.length>0,`Mortar top gap at ${x},${z}`);assert(Math.abs(hits[0].point.y-.004)<.0001,'Mortar height changed');
 }

 assert(authored.removedLegacyMeshes.some(n=>n.includes('Olive bark')));
 for(const m of materials)assert(!/olive|glass/i.test(m.name),'Old foliage or glass remains exported');
 for(const x of [-5,-3,0,3,5])for(const z of [-8,-4,0,4,8]){
  const hits=new Raycaster(new Vector3(x,4.9,z),new Vector3(0,1,0),.001,3).intersectObject(scene,true);
  assert(hits.length>0,`Ceiling remains open at ${stem} ${x},${z}`);
 }

 for(const [name,p] of Object.entries(manifest.anchors[stem])){const node=scene.getObjectByName('anchor_'+name);assert(node);assert(node.getWorldPosition(new Vector3()).distanceTo(new Vector3(...p))<.00001);}
 const clear=(from,to)=>{const a=new Vector3(...from),b=new Vector3(...to),d=b.clone().sub(a);assert.equal(new Raycaster(a,d.clone().normalize(),.001,d.length()-.001).intersectObject(scene,true).length,0);};
 for(const dx of [-.3,0,.3])for(const dy of [-.3,0,.3]){
  clear([dx,2.2+dy,-7.5],[dx,2.2+dy,8.6]);
  if(!terminal)clear([dx,2.2+dy,8.6],[dx,2.2+dy,10]);
  if(stem==='extension')clear([dx,2.2+dy,-10],[dx,2.2+dy,-8]);
  for(const s of [-1,1])clear([s*5,2.2+dy,-6.5+dx],[s*7,2.2+dy,-6.5+dx]);
 }
 if(terminal)for(const x of [-5,-3,-1.5,0,1.5,3,5])for(const y of [.05,.3,2.2,4.2,5.4]){const hits=new Raycaster(new Vector3(x,y,8),new Vector3(0,0,1),0,2).intersectObject(scene,true);assert(hits.some(h=>Math.abs(h.point.z-8.85)<.0001),`Terminal must have a continuous plane at ${x},${y}; hits:${hits.map(h=>h.point.z)}`);}
 results.push({stem:fileStem,bytes,triangles,meshes,materials,treeBounds,anchors:'passed',portals:'passed',ceilingClosedRays:25,bevelUV:authored.floorBevelUV});
}
await writeFile(new URL(`artifacts/museum/${variant}-export-validation.json`,root),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
