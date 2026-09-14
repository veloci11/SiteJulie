/** Restrained limestone derived from the same CC0 source; no external new assets. */
import sharp from 'sharp';import{mkdir,copyFile,writeFile}from'node:fs/promises';
const dest='public/museum/contemporary/details';await mkdir(dest,{recursive:true});
for(const name of ['wood-base','wood-normal','wood-roughness','linen-base','linen-normal','jute-base','jute-normal','stone-normal'])await copyFile(`public/museum/interior/details/${name}.webp`,`${dest}/${name}.webp`);
const {data,info}=await sharp('public/museum/interior/details/stone-base.webp').removeAlpha().raw().toBuffer({resolveWithObject:true});const result=Buffer.alloc(data.length);
const linear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;const srgb=x=>Math.round(255*(x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055));
let mean=0;for(let i=0;i<data.length;i+=3)mean+=.2126*linear(data[i]/255)+.7152*linear(data[i+1]/255)+.0722*linear(data[i+2]/255);mean/=data.length/3;
for(let i=0;i<data.length;i+=3){const value=(.2126*linear(data[i]/255)+.7152*linear(data[i+1]/255)+.0722*linear(data[i+2]/255))/mean;for(let c=0;c<3;c++)result[i+c]=srgb([.72,.70,.66][c]*(.86+.14*value));}
await sharp(result,{raw:info}).webp({quality:90}).toFile(`${dest}/stone-base.webp`);
await sharp({create:{width:128,height:128,channels:3,background:{r:228,g:228,b:228}}}).webp({quality:92}).toFile(`${dest}/stone-roughness.webp`);
// Preserve the real walnut pores while lowering broad veneer streak contrast.
const walnut=await sharp('public/museum/interior/details/wood-base.webp').removeAlpha().raw().toBuffer({resolveWithObject:true});
const walnutMean=[0,0,0];for(let i=0;i<walnut.data.length;i+=3)for(let c=0;c<3;c++)walnutMean[c]+=linear(walnut.data[i+c]/255)/(walnut.data.length/3);
const subtleWood=Buffer.alloc(walnut.data.length);for(let i=0;i<walnut.data.length;i+=3)for(let c=0;c<3;c++)subtleWood[i+c]=srgb(walnutMean[c]+.32*(linear(walnut.data[i+c]/255)-walnutMean[c]));
await sharp(subtleWood,{raw:walnut.info}).webp({quality:90}).toFile(`${dest}/wood-base.webp`);
await writeFile(`${dest}/manifest.json`,JSON.stringify({stone:{periodMeters:1.2,source:'ambientCG Travertine009 CC0; restrained limestone derivative',change:'linear luminance variation14%; neutral stone albedo [.72,.70,.66]; roughness map .894'},wood:{periodMeters:.60,linearContrast:.32,normalStrength:.055,source:'Poly Haven natural_walnut_veneer CC0'},linen:{periodMeters:.032,source:'Original procedural interlaced weave'}},null,2));
