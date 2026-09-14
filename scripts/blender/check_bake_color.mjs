import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {strict as assert} from 'node:assert';
const stem=process.argv[2]||'hall';
const report=JSON.parse(await readFile(`public/museum/bakes/${stem}-report.json`));
const results=[];
for(const atlas of report.atlases){
 const {data,info}=await sharp(`public${atlas.path}`).raw().toBuffer({resolveWithObject:true});
 for(const probe of atlas.pixelProbes){
  const offset=(probe.y*info.width+probe.x)*info.channels;
  const decoded=[0,1,2].map(i=>{const c=data[offset+i]/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
  const maxError=Math.max(...decoded.map((v,i)=>Math.abs(v-probe.expectedLinear[i])));
  assert(maxError<.005,`sRGB round-trip failed: ${maxError}`);
  results.push({group:atlas.group,x:probe.x,y:probe.y,expectedLinear:probe.expectedLinear,decodedLinear:decoded,maxError});
 }
}
await writeFile(`artifacts/museum/${stem}-bake-color-validation.json`,JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify({passed:true,results},null,2));
