import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import worker from '../release/worker.mjs';
import {createPages,aliases} from '../release/pages.mjs';
const origin='https://frjd.test';
const good=()=>({kind:'quote',name:'Launch QA',email:'qa@example.invalid',productUrl:'https://detail.1688.com/offer/123.html',quantity:'25',destination:'United Kingdom',consent:true,idempotencyKey:crypto.randomUUID()});
async function db(){const sqlite=new DatabaseSync(':memory:');for(const f of(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')))sqlite.exec(await readFile(new URL('../drizzle/'+f,import.meta.url),'utf8'));function prepare(sql,args=[]){return{bind(...values){return prepare(sql,values);},async first(){return sqlite.prepare(sql).get(...args);},async all(){return{results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);}};}return{prepare,sqlite};}
const req=(p,headers={})=>new Request(origin+'/api/submit-quote',{method:'POST',headers:{'content-type':'application/json',origin,...headers},body:JSON.stringify(p)});
test('all canonical pages, alias redirects, assets references and metadata are coherent',async()=>{
 const pages=createPages();assert.equal(Object.keys(pages).length,16);
 for(const [name,html]of Object.entries(pages)){
  const r=await worker.fetch(new Request(origin+'/'+name),{},{});assert.equal(r.status,name==='404.html'?404:name==='index.html'?301:200,name);
  assert.match(html,/<title>.+?\| FRJD<\/title>/);assert.match(html,/name="description"/);assert.match(html,/<h1>/);assert.match(html,/rel="icon"/);
  for(const [,href]of html.matchAll(/href="([^"?#]+)(?:[?#][^"]*)?"/g)){if(href.startsWith('/')&&href.endsWith('.html'))assert.ok(pages[href.slice(1)]||aliases[href.slice(1)],name+': '+href);}
  assert.doesNotMatch(html,/quotes@frjd|support@frjd|3% Fee|zero hidden|LIVE<|HUB-GZ-01|91440300|in-house quality|ISO 9001|C-TPAT/i);
 }
 for(const name of Object.keys(aliases)){const r=await worker.fetch(new Request(origin+'/'+name),{},{});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/'+aliases[name]);}
});
test('quote is durably stored with all customer details before success; retry is idempotent',async()=>{
 const DB=await db();const p={...good(),notes:'Blue bags; exact 40 cm width',targetPrice:'USD 2.50',company:'QA company',whatsapp:'+441234567890'};
 const r=await worker.fetch(req(p),{DB},{});assert.equal(r.status,201);const result=await r.json();const saved=DB.sqlite.prepare('SELECT * FROM enquiries WHERE id=?').get(result.request_id);assert.ok(saved);assert.equal(JSON.parse(saved.payload).notes,p.notes);assert.equal(JSON.parse(saved.payload).email,p.email);
 const retry=await worker.fetch(req(p),{DB},{});assert.equal((await retry.json()).request_id,result.request_id);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n,1);
 const conflict=await worker.fetch(req({...p,notes:'changed'}),{DB},{});assert.equal(conflict.status,409);
});
test('contact and tracking enquiries save independently; WhatsApp-only and product-name-only are accepted',async()=>{
 const DB=await db();for(const kind of ['contact','tracking','quote']){const p={...good(),kind,productUrl:'',productName:'Blue tote bags',email:'',whatsapp:'+441234567890',subject:'Service enquiry',notes:'Please review',shipmentReference:'CUSTOMER-123'};const r=await worker.fetch(req(p),{DB},{});assert.equal(r.status,201,await r.text());}
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n,3);
});
test('validation rejects malicious URLs, invalid quantity, missing contact/consent and oversized body',async()=>{
 const DB=await db();for(const change of [{productUrl:'javascript:alert(1)'},{productUrl:'https://user:password@example.com'},{quantity:'-1'},{quantity:'1.5'},{destination:''},{email:'invalid'},{email:'',whatsapp:''},{consent:false},{kind:'admin'},{notes:'a'.repeat(5001)},{website:'spam'}]){const r=await worker.fetch(req({...good(),...change}),{DB},{});assert.equal(r.status,400,JSON.stringify(change));}
 const large=await worker.fetch(req({...good(),notes:'a'.repeat(22000)}),{DB},{});assert.equal(large.status,413);
 const cross=await worker.fetch(req(good(),{origin:'https://malicious.test'}),{DB},{});assert.equal(cross.status,403);
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n,0);
});
test('missing or failed storage never produces successful acknowledgement',async()=>{
 const missing=await worker.fetch(req(good()),{},{});assert.equal(missing.status,503);assert.equal((await missing.json()).success,false);
 const broken=await worker.fetch(req(good()),{DB:{prepare(){throw Error('database offline');}}},{});assert.equal(broken.status,503);assert.equal((await broken.json()).success,false);
});
test('request flooding is limited in the database',async()=>{
 const DB=await db();for(let i=0;i<20;i++){const r=await worker.fetch(req(good()),{DB},{});assert.equal(r.status,201);}const r=await worker.fetch(req(good()),{DB},{});assert.equal(r.status,429);
});
test('private files, customer records and unconfigured contact destinations are not exposed',async()=>{
 const DB=await db();for(const path of ['/api/admin/enquiries','/api/admin/enquiries?token=guess'])assert.equal((await worker.fetch(new Request(origin+path),{DB},{})).status,401);
 for(const path of ['/server.js','/.env','/.local/enquiries.sqlite','/db/schema.ts','/api/submit-quote.js','/package.json','/logs/requests.log'])assert.equal((await worker.fetch(new Request(origin+path),{DB},{})).status,404,path);
 const config=await worker.fetch(new Request(origin+'/api/config'),{},{});assert.deepEqual(await config.json(),{contactEmail:'',whatsappNumber:''});
 const valid=await worker.fetch(new Request(origin+'/api/config'),{FRJD_CONTACT_EMAIL:'confirmed@example.com',FRJD_WHATSAPP_NUMBER:'+441234567890'},{});assert.equal((await valid.json()).contactEmail,'confirmed@example.com');
 const admin=await worker.fetch(new Request(origin+'/api/admin/enquiries',{headers:{Authorization:'Bearer local-test-secret'}}),{DB,FRJD_ADMIN_TOKEN:'local-test-secret'},{});assert.equal(admin.status,200);
});
test('SEO endpoints and integrations return truthful states and security headers',async()=>{
 for(const path of ['/','/sitemap.xml','/robots.txt']){const r=await worker.fetch(new Request(origin+path),{},{});assert.equal(r.status,200);assert.equal(r.headers.get('x-content-type-options'),'nosniff');}
 for(const path of ['/api/track','/api/resolve-product','/api/quote/estimate']){const r=await worker.fetch(new Request(origin+path,{method:'POST'}),{},{});assert.equal((await r.json()).available,false);}
});

