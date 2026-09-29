import {requireThat} from './errors.js';
export async function boundedText(response:Response,limit:number,code:string){
 const reader=response.body?.getReader();requireThat(reader,code);
 const parts:Uint8Array[]=[];let bytes=0;
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;requireThat(bytes<=limit,code);parts.push(chunk.value);}}
 catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 return Buffer.concat(parts).toString('utf8');
}
