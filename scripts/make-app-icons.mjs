// Original minimal bag glyph, generated without third-party assets.
import {deflateSync} from 'node:zlib';
import {mkdir,writeFile} from 'node:fs/promises';
const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const t=Buffer.from(type),n=Buffer.alloc(4),sum=Buffer.alloc(4);n.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([n,t,data,sum]);};
await mkdir(new URL('../frontend/public/icons/',import.meta.url),{recursive:true});
for(const size of [192,512]){
 const raw=Buffer.alloc(size*(1+size*4));
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size;
  const bag=u>.30&&u<.70&&v>.43&&v<.72;
  const handle=(u>.40&&u<.60&&v>.29&&v<.45)&&!(u>.44&&u<.56&&v>.33);
  raw.set(bag||handle?[245,248,247,255]:[40,91,80,255],y*(1+size*4)+1+x*4);
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 await writeFile(new URL('../frontend/public/icons/app-'+size+'.png',import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
