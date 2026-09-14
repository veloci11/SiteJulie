/** Small shared material maps. CC0 inputs stay private; authored weaves are periodic. */
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
const out='public/museum/interior/details';await mkdir(out,{recursive:true});
for(const [kind,source] of [['stone','travertine'],['wood','walnut']]){
 await sharp(`assets/materials/pbr/${source}/base_color.png`).resize(1024,1024).toColourspace('srgb').webp({quality:90}).toFile(`${out}/${kind}-base.webp`);
 await sharp(`assets/materials/pbr/${source}/normal_gl.png`).resize(512,512).toColourspace('srgb').webp({quality:92}).toFile(`${out}/${kind}-normal.webp`);
 await sharp(`assets/materials/pbr/${source}/roughness.png`).resize(512,512).toColourspace('b-w').webp({quality:88}).toFile(`${out}/${kind}-roughness.webp`);
}
for(const [kind,cells] of [['linen',32],['jute',24]]){
 const size=512,h=new Float32Array(size*size),base=Buffer.alloc(size*size*3),normal=Buffer.alloc(size*size*3);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size*cells,v=y/size*cells,ix=Math.floor(u),iy=Math.floor(v),a=u-ix,b=v-iy;
  const over=(ix+iy)%2===0;
  const thread=Math.pow(Math.sin(Math.PI*(over?b:a)),.7);
  const ridge=.85+.15*Math.sin(Math.PI*(over?a:b));
  const fiber=.018*Math.sin((over?v:u)*Math.PI*24)+.008*Math.sin((u+v)*Math.PI*14);
  h[y*size+x]=thread*ridge+fiber;
  const shade=(kind==='linen'?.83:.71)+(kind==='linen'?.12:.22)*thread*ridge+fiber;
  const variation=1+.02*Math.sin(ix*17.27+iy*4.91);
  for(let c=0;c<3;c++)base[(y*size+x)*3+c]=Math.round(Math.min(1,shade*variation)*255);
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const strength=kind==='linen'?.45:.6;
  const dx=(h[y*size+(x+1)%size]-h[y*size+(x+size-1)%size])*strength;
  const dy=(h[((y+1)%size)*size+x]-h[((y+size-1)%size)*size+x])*strength;
  const length=Math.hypot(dx,dy,1),i=(y*size+x)*3;
  normal[i]=Math.round((.5-dx/length*.5)*255);normal[i+1]=Math.round((.5+dy/length*.5)*255);normal[i+2]=Math.round((.5+1/length*.5)*255);
 }
 await sharp(base,{raw:{width:size,height:size,channels:3}}).webp({quality:94}).toFile(`${out}/${kind}-base.webp`);
 await sharp(normal,{raw:{width:size,height:size,channels:3}}).webp({quality:92}).toFile(`${out}/${kind}-normal.webp`);
}
await writeFile(`${out}/manifest.json`,JSON.stringify({stone:{periodMeters:1.2,source:'ambientCG Travertine009 CC0'},wood:{periodMeters:1,source:'Poly Haven natural_walnut_veneer CC0'},linen:{periodMeters:.032,source:'Original procedural interlaced weave',normalStrength:.12},jute:{periodMeters:.12,source:'Original procedural interlaced weave',normalStrength:.2}},null,2));
