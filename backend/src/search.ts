import https from "node:https";
import { lookup } from "node:dns/promises";
import { randomUUID, createHash } from "node:crypto";
import { load } from "cheerio";
import ipaddr from "ipaddr.js";
import { AppError,requireThat } from "./errors.js";
export function publicAddress(address:string) {
 try { const ip=ipaddr.process(address);return ip.range()==="unicast"; }catch{return false;}
}
export async function safeHttp(raw:string,allowed:Set<string>,redirects=0):Promise<{text:string;url:string;hash:string}> {
 const url=new URL(raw);
 requireThat(url.protocol==="https:" && (!url.port||url.port==="443")&&!url.username&&!url.password&&allowed.has(url.hostname.toLowerCase()),"SOURCE_NOT_ALLOWED");
 requireThat(redirects<=3,"TOO_MANY_REDIRECTS");
 const addresses=await lookup(url.hostname,{all:true});
 requireThat(addresses.length>0&&addresses.every(a=>publicAddress(a.address)),"UNSAFE_SOURCE_ADDRESS");
 const pinned=addresses[0];
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{headers:{Accept:"text/html,application/json,text/plain","Accept-Encoding":"identity"},
   lookup:((_host:any,options:any,callback:any)=>options?.all?callback(null,[pinned]):callback(null,pinned.address,pinned.family)) as any,
  },res=>{
   if(res.statusCode && [301,302,303,307,308].includes(res.statusCode)){
    res.resume();if(!res.headers.location)return reject(new AppError("SOURCE_REDIRECT_INVALID"));
    safeHttp(new URL(res.headers.location,url).href,allowed,redirects+1).then(resolve,reject);return;
   }
   if(res.statusCode!==200){res.resume();return reject(new AppError("SOURCE_UNAVAILABLE"));}
   if(res.headers["content-encoding"]&&res.headers["content-encoding"]!=="identity"){res.resume();return reject(new AppError("UNSUPPORTED_ENCODING"));}
   if(!/^(text\/(html|plain)|application\/json)(;|$)/i.test(res.headers["content-type"]??"")){res.resume();return reject(new AppError("UNSUPPORTED_SOURCE"));}
   let bytes=0;const parts:Buffer[]=[];
   res.on("data",b=>{bytes+=b.length;if(bytes>2*1024*1024){req.destroy(new AppError("SOURCE_TOO_LARGE"));return;}parts.push(b);});
   res.on("error",reject);
   res.on("end",()=>{const text=Buffer.concat(parts).toString("utf8");resolve({text,url:url.href,hash:createHash("sha256").update(text).digest("hex")});});
  });
  const timer=setTimeout(()=>req.destroy(new AppError("SOURCE_TIMEOUT")),10000);
  req.on("close",()=>clearTimeout(timer));req.on("error",reject);
 });
}
export function parseProduct(html:string) {
 const $=load(html);const found:any[]=[];
 function visit(node:any){if(!node||typeof node!=="object")return;
  if(Array.isArray(node))return node.forEach(visit);
  if([node["@type"]].flat().includes("Product"))found.push(node);
  if(node["@graph"])visit(node["@graph"]);
 }
 $('script[type="application/ld+json"]').each((_i,e)=>{try{visit(JSON.parse($(e).text()));}catch{}});
 if(found.length!==1)return null;
 const p=found[0];const offers=Array.isArray(p.offers)?p.offers:[p.offers];
 // Ambiguous variants and ranges cannot be treated as a selected quote.
 const o=offers.length===1?offers[0]:null;
 const rating=p.aggregateRating;
 return {
  name:typeof p.name==="string"?p.name.slice(0,300):null,
  merchant:typeof o?.seller?.name==="string"?o.seller.name.slice(0,200):null,
  brand:typeof p.brand==="string"?p.brand:typeof p.brand?.name==="string"?p.brand.name:null,
  observedPrice:typeof o?.price==="string"||typeof o?.price==="number"?String(o.price):null,
  currency:typeof o?.priceCurrency==="string"?o.priceCurrency:null,
  rating: rating && Number(rating.bestRating??5)===5 && Number.isFinite(Number(rating.ratingValue)) &&
   Number(rating.ratingValue)>=0 && Number(rating.ratingValue)<=5 ? Number(rating.ratingValue):null,
  reviewCount: rating && Number.isSafeInteger(Number(rating.reviewCount??rating.ratingCount))?Number(rating.reviewCount??rating.ratingCount):null
 };
}
export class SearchService {
 private active=0;
 constructor(private key:string|undefined,private allowed:Set<string>) {}
 async search(query:string) {
  requireThat(this.key,"SEARCH_NOT_CONFIGURED",503);
  requireThat(query.length<=600&&query.trim().split(/\s+/).length<=75,"INVALID_QUERY",400);
  requireThat(this.active<4,"SEARCH_BUSY",429);this.active++;
  try{
   const url=new URL("https://api.search.brave.com/res/v1/web/search");url.searchParams.set("q",query);url.searchParams.set("count","10");
   let result:any;
   for(let attempt=0;attempt<3;attempt++){
    const response=await fetch(url,{headers:{"X-Subscription-Token":this.key!,Accept:"application/json"},signal:AbortSignal.timeout(10000)});
    if(response.status===401||response.status===403)throw new AppError("SEARCH_NOT_CONFIGURED",503);
    if((response.status===429||response.status>=500)&&attempt<2){await new Promise(r=>setTimeout(r,300*(attempt+1)));continue;}
    requireThat(response.ok,"SEARCH_UNAVAILABLE",503);
    const text=await response.text();requireThat(text.length<2*1024*1024,"SEARCH_RESPONSE_TOO_LARGE");
    result=JSON.parse(text);break;
   }
   requireThat(result&&(!result.web||Array.isArray(result.web.results)),"SEARCH_INVALID_RESPONSE");
   const candidates=[];
   for(const item of (result.web?.results??[]).slice(0,20)){
    if(typeof item.url!=="string"||typeof item.title!=="string")continue;
    const c:any={id:randomUUID(),name:item.title.slice(0,300),url:item.url,sourceId:randomUUID(),
      fetchedAt:new Date().toISOString(),evidenceType:"SEARCH_SNIPPET",fields:null,sourceError:null};
    try { const src=await safeHttp(item.url,this.allowed);c.fields=parseProduct(src.text);
     c.url=src.url;c.contentHash=src.hash;c.parserVersion="jsonld-product-v1";
     c.evidenceType=c.fields?"HTML_OBSERVATION":"SEARCH_SNIPPET";
     if(!c.fields)c.sourceError="UNSUPPORTED_SOURCE";
    }catch(e){c.sourceError=e instanceof AppError?e.code:"SOURCE_UNAVAILABLE";}
    candidates.push(c);
   }
   return candidates;
  }finally{this.active--;}
 }
}
