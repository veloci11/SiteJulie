/** Read-only local layout for source visibility renders. No prices or labels. */
import {readFile,writeFile,access} from 'node:fs/promises';
import {slotForArtwork,artworkSize,roomOffset,ARTWORK_IMAGE_DEPTH,ARTWORK_WALL_CLEARANCE} from '../../lib/museum/config.ts';
const data=JSON.parse(await readFile('.local/data.json','utf8'));
const artworks=[];
for(const a of data.artworks.filter(a=>a.publication==='published')){
 const slot=slotForArtwork(a);if(!slot)continue;
 if(!/^[a-zA-Z0-9_-]+$/.test(a.id))continue;
 const image=`.local/media/${a.id}-room.webp`;await access(image);
 const size=artworkSize(a,slot);
 artworks.push({id:a.id,module:a.roomId==='room-1'?'hall':'extension',position:slot.position.map((v,i)=>v-(i===2?roomOffset(a.roomId):0)),rotationY:slot.rotationY,width:size.width,height:size.height,image});
}
await writeFile('artifacts/museum/source-artwork-layout.json',JSON.stringify({imageDepth:ARTWORK_IMAGE_DEPTH,wallClearance:ARTWORK_WALL_CLEARANCE,artworks},null,2)+'\n');
console.log(`${artworks.length} published artwork positions prepared for read-only source renders`);
