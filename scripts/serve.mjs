import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const Feed=createRequire(import.meta.url)('../public-feed.js');
const root=resolve(import.meta.dirname,'..');
const port=Number(process.env.PORT || 4178);
const allowed=new Set(['index.html','404.html','app.js','style.css','config.js','public-feed.js','i18n.js','light-body.js','index.md','agents.md','robots.txt','sitemap.xml','llms.txt','assets/favicon.svg','assets/og-image.svg','assets/fallback-snapshot.json']);
const types={html:'text/html',js:'text/javascript',css:'text/css',json:'application/json',md:'text/markdown',txt:'text/plain',xml:'application/xml',svg:'image/svg+xml'};
let bridge=null;
if(process.env.ART_BRIDGE_MODULE)bridge=await import(pathToFileURL(resolve(root,process.env.ART_BRIDGE_MODULE)));
const flights=new Map(),cache=new Map();
async function exhibition(date) {
 const key=date||'current', saved=cache.get(key);
 if(saved && Date.now()-saved.at<15000)return saved.feed;
 if(flights.has(key))return flights.get(key);
 if(flights.size>=4)throw Error('Busy');
 const task=(async()=>{
  let feed;
  if(bridge)feed=Feed.project(await bridge.readExhibition(date));
  else if(process.env.ART_FEED_URL){const url=new URL(process.env.ART_FEED_URL);if(date)url.searchParams.set('date',date);feed=await Feed.request(url.href);}
  else throw Error('No exhibition feed configured');
  cache.delete(key);cache.set(key,{at:Date.now(),feed});while(cache.size>40)cache.delete(cache.keys().next().value);return feed;
 })().finally(()=>flights.delete(key));flights.set(key,task);return task;
}
createServer(async(req,res)=>{
 const send=(status,type,body)=>{res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'"});res.end(req.method==='HEAD'?'':body);};
 if(!['GET','HEAD'].includes(req.method)){send(405,'text/plain','Method not allowed');return;}
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/exhibition'){
   if([...url.searchParams.keys()].some(key=>key!=='date')||url.searchParams.getAll('date').length>1){send(400,'application/json','{}');return;}
   const date=url.searchParams.get('date');
   const timestamp=date?Date.parse(date+'T00:00:00Z'):NaN;
   if(date && (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==date)){send(400,'application/json','{}');return;}
   send(200,'application/json',JSON.stringify(await exhibition(date)));return;
  }
  const path=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
  if(!allowed.has(path)){
   if(/^art(?:\/|$)/.test(path)){res.writeHead(302,{Location:'/'+url.search+'#/'+path});res.end();return;}
   send(404,'text/plain','Not found');return;
  }
  send(200,types[path.split('.').pop()]||'text/plain',await readFile(resolve(root,path)));
 }catch{send(503,'application/json','{"error":"exhibition_unavailable"}');}
}).listen(port,'127.0.0.1',()=>console.log(`My Traces: http://127.0.0.1:${port}`));
