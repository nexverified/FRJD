import http from 'node:http';
import {readFile,mkdir,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import worker from './worker.mjs';
await mkdir('.local',{recursive:true});
const sqlite=new DatabaseSync('.local/enquiries.sqlite');
const files=(await readdir('drizzle')).filter(x=>x.endsWith('.sql'));
for(const file of files){const sql=await readFile('drizzle/'+file,'utf8');sqlite.exec(sql.replaceAll('CREATE TABLE ','CREATE TABLE IF NOT EXISTS ').replaceAll('CREATE UNIQUE INDEX ','CREATE UNIQUE INDEX IF NOT EXISTS ').replaceAll('CREATE INDEX ','CREATE INDEX IF NOT EXISTS '));}
function prepared(sql,params=[]){return{bind(...args){return prepared(sql,args);},async first(){return sqlite.prepare(sql).get(...params)||null;},async all(){return{results:sqlite.prepare(sql).all(...params)};},async run(){return sqlite.prepare(sql).run(...params);}};}
const env={...process.env,DB:{prepare:prepared},ASSETS:{async fetch(request){const url=new URL(request.url);const file=path.join(process.cwd(),'dist/client',url.pathname);try{const bytes=await readFile(file);return new Response(bytes,{headers:{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':file.endsWith('.svg')?'image/svg+xml':'image/jpeg'}});}catch{return new Response('Not found',{status:404});}}}};
const server=http.createServer(async(req,res)=>{
 try{const host='127.0.0.1:'+server.address().port;const request=new Request('http://'+host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});const response=await worker.fetch(request,env,{waitUntil:p=>p.catch(()=>{})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Preview request failed');}
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('FRJD preview: http://127.0.0.1:'+server.address().port));
