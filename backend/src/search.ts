import https from "node:https";
import { lookup } from "node:dns/promises";
import { randomUUID, createHash } from "node:crypto";
import { load } from "cheerio";
import ipaddr from "ipaddr.js";
import { AppError,requireThat } from "./errors.js";
import {boundedText} from './httpBody.js';
export const defaultProductHosts='www.11st.co.kr,www.ikea.com';
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
export function parseProduct(html:string,sourceUrl?:string) {
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
 const shippingDetails=Array.isArray(o?.shippingDetails)?o.shippingDetails:[o?.shippingDetails];
 const shippingRate=shippingDetails.length===1?shippingDetails[0]?.shippingRate:null;
 const freeShipping=sourceUrl&&new URL(sourceUrl).hostname==='www.11st.co.kr'&&/^배송비\s*무료배송/.test($('.delivery > dt').first().text().replace(/\s+/g,' ').trim());
 return {
  name:typeof p.name==="string"?p.name.slice(0,300):null,
  merchant:typeof o?.seller?.name==="string"?o.seller.name.slice(0,200):null,
  brand:typeof p.brand==="string"?p.brand:typeof p.brand?.name==="string"?p.brand.name:null,
  observedPrice:typeof o?.price==="string"||typeof o?.price==="number"?String(o.price):null,
  currency:typeof o?.priceCurrency==="string"?o.priceCurrency:null,
  observedShipping:typeof shippingRate?.value==="string"||typeof shippingRate?.value==="number"?String(shippingRate.value):freeShipping?'0':null,
  shippingCurrency:typeof shippingRate?.currency==="string"?shippingRate.currency:freeShipping?o?.priceCurrency??null:null,
  shippingEvidence:freeShipping?'11ST_PAGE_FREE_SHIPPING':shippingRate?'SCHEMA_ORG':null,
  rating: rating && Number(rating.bestRating??5)===5 && Number.isFinite(Number(rating.ratingValue)) &&
   Number(rating.ratingValue)>=0 && Number(rating.ratingValue)<=5 ? Number(rating.ratingValue):null,
  reviewCount: rating && Number.isSafeInteger(Number(rating.reviewCount??rating.ratingCount))?Number(rating.reviewCount??rating.ratingCount):null
 };
}
export class SearchService {
 private active=0;
 private cursors=new Map<string,{query:string;context:string;offset:number;expires:number}>();
 constructor(private endpoint:string|undefined,private allowed:Set<string>,private internalSecret?:string) {}
 approvedHosts(){return [...this.allowed];}
 configured(){return !!this.endpoint;}
 async search(query:string){return (await this.searchPage(query,'direct')).candidates;}
 async searchPage(query:string,context:string,cursor?:string) {
  requireThat(this.endpoint,"SEARCH_NOT_CONFIGURED",503);
  requireThat(query.length<=600&&query.trim().split(/\s+/).length<=75,"INVALID_QUERY",400);
  requireThat(this.active<4,"SEARCH_BUSY",429);this.active++;
  try{
   const page=cursor?this.cursors.get(cursor):null;
   requireThat(!cursor||(page&&page.query===query&&page.context===context&&page.expires>Date.now()),'SEARCH_CURSOR_INVALID');
   const offset=page?.offset??0;
   const url=new URL(this.endpoint!);
   requireThat(!url.username&&!url.password&&!url.search&&!url.hash&&(this.internalSecret?url.protocol==='https:'&&url.pathname==='/api/compute':url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.pathname==='/'),"SEARCH_ENDPOINT_INVALID");
   if(!this.internalSecret)url.pathname='/search/text';
   let response:Response;
   try{response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(this.internalSecret?{Authorization:'Bearer '+this.internalSecret}:{})},body:JSON.stringify({...(this.internalSecret?{operation:'search'}:{}),query,page:offset+1,approvedHosts:[...this.allowed]}),signal:AbortSignal.timeout(20000)});}
   catch{throw new AppError('SEARCH_UNAVAILABLE',503);}
   requireThat(response.ok,response.status===429?'SEARCH_BUSY':'SEARCH_UNAVAILABLE',503);
   let result:any;try{result=JSON.parse(await boundedText(response,2*1024*1024,'SEARCH_RESPONSE_TOO_LARGE'));}catch(e){if(e instanceof AppError)throw e;throw new AppError('SEARCH_INVALID_RESPONSE');}
   const ddgsResult=result?.provider==='ddgs'&&result.backend==='multi';
   const tavilyResult=result?.provider==='tavily'&&result.backend==='tavily';
   requireThat((ddgsResult||tavilyResult)&&typeof result.partial==='boolean'&&
     Array.isArray(result.failedEngines)&&result.failedEngines.length<=(ddgsResult?6:0)&&result.failedEngines.every((engine:string)=>['duckduckgo','brave','google','mojeek','startpage','yahoo'].includes(engine))&&
    Array.isArray(result.results)&&result.results.length<=10,"SEARCH_INVALID_RESPONSE");
   requireThat(result.results.every((v:any)=>v&&typeof v.href==='string'&&typeof v.title==='string'&&v.title.length>0&&v.href.length<4096),"SEARCH_INVALID_RESPONSE");
    const discovery=result.results.slice(0,8).flatMap((item:any)=>{
     let parsed:URL;try{parsed=new URL(item.href);}catch{return [];}
     if(parsed.protocol!=='https:'||parsed.username||parsed.password)return [];
     return [{host:parsed.hostname.toLowerCase(),approvedSource:this.allowed.has(parsed.hostname.toLowerCase()),
      title:item.title.slice(0,200),snippet:typeof item.body==='string'?item.body.replace(/\s+/g,' ').slice(0,320):''}];
    });
   const inspect=async(item:any)=>{
    if(typeof item.href!=="string"||typeof item.title!=="string")return null;
    let parsed:URL;try{parsed=new URL(item.href);}catch{return null;}
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||!this.allowed.has(parsed.hostname.toLowerCase()))return null;
    const c:any={id:randomUUID(),name:item.title.slice(0,300),url:item.href,sourceId:randomUUID(),
      fetchedAt:new Date().toISOString(),evidenceType:"SEARCH_SNIPPET",fields:null,sourceError:null};
    try { const src=await safeHttp(item.href,this.allowed);c.fields=parseProduct(src.text,src.url);
     c.url=src.url;c.contentHash=src.hash;c.parserVersion="jsonld-product-v1";
     c.evidenceType=c.fields?"HTML_OBSERVATION":"SEARCH_SNIPPET";
     if(c.fields)c.verifiedMerchantHost=new URL(src.url).hostname.toLowerCase();
     if(!c.fields)c.sourceError="UNSUPPORTED_SOURCE";
    }catch(e){c.sourceError=e instanceof AppError?e.code:"SOURCE_UNAVAILABLE";}
    return c;
   };
   const candidates:any[]=[];
   for(let i=0;i<result.results.length;i+=4)
    candidates.push(...(await Promise.all(result.results.slice(i,i+4).map(inspect))).filter(Boolean));
   let nextCursor:string|null=null;
   if(result.backend==='multi'&&result.results.length===10&&offset<9){
    for(const [k,v] of this.cursors)if(v.expires<Date.now())this.cursors.delete(k);
    if(this.cursors.size>=1000)this.cursors.delete(this.cursors.keys().next().value!);
    nextCursor=randomUUID();this.cursors.set(nextCursor,{query,context,offset:offset+1,expires:Date.now()+300000});
   }
    return {candidates,nextCursor,discovery,partial:result.partial,failedEngines:result.failedEngines};
  }finally{this.active--;}
 }
}
