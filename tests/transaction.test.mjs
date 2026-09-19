import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import worker from '../release/worker.mjs';
import {normalizeProductUrl} from '../release/transaction.mjs';

const origin='https://frjd.test';
const operatorSecret='test-only-operator-credential-48-characters-long';
const operatorEnv={FRJD_ADMIN_TOKEN:operatorSecret};
const token=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
const good=()=>({name:'Sprint 1 QA',company:'Test Company',email:'qa@example.invalid',whatsapp:'',
  productUrl:'https://detail.1688.com/offer/123456789012.html',productName:'Canvas tote bag',quantity:'500',
  variantSpecification:'Natural cotton, 40 cm width',destination:'United Kingdom',postalCode:'SW1A 1AA',
  targetPrice:'CNY 12.00',service:'Purchasing, inspection & shipping',qcRequirement:'BASIC',
  notes:'Test transaction only. Do not contact.',consent:true,idempotencyKey:crypto.randomUUID(),accessToken:token()});
async function database(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const name of(await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  let failAt=0;
  function prepare(sql,args=[]){return{sql,params:args,bind(...values){return prepare(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return{results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);}};}
  async function batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=[];for(let i=0;i<statements.length;i++){
    if(failAt===i+1)throw Error('injected database failure');const statement=statements[i],query=sqlite.prepare(statement.sql);
    if(/^\s*(SELECT|WITH)\b/i.test(statement.sql)||/\bRETURNING\b/i.test(statement.sql))results.push({results:query.all(...statement.params)});
    else{query.run(...statement.params);results.push({results:[]});}
  }sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}
  return {sqlite,DB:{prepare,batch},failOn(n){failAt=n;}};
}
const request=(path,method='GET',body,headers={})=>new Request(origin+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
async function call(db,path,method='GET',body,headers={},env={}){const result=await worker.fetch(request(path,method,body,headers),{DB:db.DB,...env},{});let json;try{json=await result.json();}catch{json=null;}return {status:result.status,body:json,headers:result.headers};}
const customerHeaders=secret=>({Authorization:'Bearer '+secret,Origin:'https://nexverified.github.io'});
const operatorHeaders={Authorization:'Bearer '+operatorSecret};
const quoteBody=(version,amount=12500)=>({expectedVersion:version,currency:'CNY',validUntil:new Date(Date.now()+7*86400000).toISOString().slice(0,10),
  customerNotes:'Includes the listed services only.',operatorNotes:'Test quote only.',items:[
    {category:'GOODS',description:'500 canvas tote bags',amountMinor:amount},
    {category:'CHINA_FREIGHT',description:'China domestic freight',amountMinor:2200},
    {category:'SERVICE',description:'Procurement service',amountMinor:1900},
    {category:'QC',description:'Basic receiving checks',amountMinor:800},
  ]});
async function make(db,p=good()){const result=await call(db,'/api/procurement-requests','POST',p,{Origin:'https://nexverified.github.io'});assert.equal(result.status,201,JSON.stringify(result.body));return {p,ref:result.body.request_ref,result};}

test('request creation persists a private, idempotent request, item, source, event and notification',async()=>{
  const db=await database(),{p,ref,result}=await make(db);
  assert.match(ref,/^FRJD-PR-[A-F0-9]{12}$/);assert.equal(result.body.status,'SUBMITTED');assert.ok(result.body.submitted_at);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM procurement_requests').get().n,1);
  assert.equal(db.sqlite.prepare('SELECT platform FROM product_sources').get().platform,'1688');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM events').get().n,1);
  assert.equal(db.sqlite.prepare('SELECT type,status FROM notifications').get().type,'NEW_REQUEST');
  assert.notEqual(db.sqlite.prepare('SELECT access_token_hash FROM procurement_requests').get().access_token_hash,p.accessToken);
  const retry=await call(db,'/api/procurement-requests','POST',p);assert.equal(retry.status,200);assert.equal(retry.body.request_ref,ref);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM customers').get().n,1);
  const conflict=await call(db,'/api/procurement-requests','POST',{...p,quantity:'501'});assert.equal(conflict.status,409);
  assert.equal((await call(db,'/api/procurement-requests/'+ref)).status,401);
  assert.equal((await call(db,'/api/procurement-requests/'+ref,'GET',undefined,customerHeaders(token()))).status,401);
  const own=await call(db,'/api/procurement-requests/'+ref,'GET',undefined,customerHeaders(p.accessToken));assert.equal(own.status,200);
  assert.equal(own.body.request.ref,ref);assert.equal(own.body.request.status,'SUBMITTED');
  assert.equal(own.body.sources[0].platform,'1688');assert.equal(own.body.events[0].type,'REQUEST_SUBMITTED');
  assert.ok(!JSON.stringify(own.body).includes('access_token_hash'));
  assert.equal(own.headers.get('access-control-allow-origin'),'https://nexverified.github.io');
  const another=await make(db);assert.equal((await call(db,'/api/procurement-requests/'+another.ref,'GET',undefined,customerHeaders(p.accessToken))).status,401);
});

test('URL detection uses parsed host boundaries and rejects unsafe or malformed URLs',()=>{
  for(const [url,platform] of [
    ['https://detail.1688.com/offer/12.html','1688'],['https://item.taobao.com/item.htm?id=12','taobao'],
    ['https://detail.tmall.com/item.htm?id=12','tmall'],['https://www.alibaba.com/product-detail/test_12.html','alibaba'],
    ['https://item.jd.com/12.html','jd'],['https://weidian.com/item.html?itemID=12','weidian'],
    ['https://mobile.yangkeduo.com/goods.html?goods_id=12','pinduoduo'],['https://supplier.example.com/item','generic'],
  ])assert.equal(normalizeProductUrl(url).platform,platform,url);
  for(const url of ['javascript:alert(1)','https://user:password@1688.com/offer/1.html','http://localhost/item',
    'https://127.0.0.1/item','http://[::1]/item','https://1688.com.evil.test/item','https://example.local/item',
    'https://supplier.example.com:8443/item','https://supplier.example.com/a b']){
    if(url.includes('1688.com.evil.test'))assert.equal(normalizeProductUrl(url).platform,'generic');
    else assert.throws(()=>normalizeProductUrl(url),undefined,url);
  }
  assert.equal(normalizeProductUrl('https://detail.1688.com/offer/1.html#private').url,'https://detail.1688.com/offer/1.html');
});

test('operator authorization, status filters and legacy enquiries stay separate from customer access',async()=>{
  const db=await database(),{p,ref}=await make(db);
  assert.equal((await call(db,'/api/operator/requests')).status,401);
  assert.equal((await call(db,'/api/operator/requests','GET',undefined,customerHeaders(p.accessToken),operatorEnv)).status,403);
  const list=await call(db,'/api/operator/requests?status=SUBMITTED','GET',undefined,operatorHeaders,operatorEnv);
  assert.equal(list.status,200);assert.equal(list.body.requests[0].id,ref);
  assert.equal((await call(db,'/api/operator/requests?status=BOGUS','GET',undefined,operatorHeaders,operatorEnv)).status,400);
  const detail=await call(db,'/api/operator/requests/'+ref,'GET',undefined,operatorHeaders,operatorEnv);assert.equal(detail.status,200);
  assert.equal(detail.body.request.email,p.email);
  db.sqlite.prepare(`INSERT INTO enquiries (id,idempotency_key,payload_hash,kind,payload,created_at,status) VALUES ('FRJD-OLD','legacy-key','hash','quote','{"name":"Older lead"}',1,'pending')`).run();
  const legacy=await call(db,'/api/operator/legacy-enquiries','GET',undefined,operatorHeaders,operatorEnv);
  assert.equal(legacy.status,200);assert.equal(legacy.body.enquiries[0].id,'FRJD-OLD');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM enquiries').get().n,1);
});

test('verified review, immutable quote revisions, customer question and approval preserve history',async()=>{
  const db=await database(),{p,ref}=await make(db);
  const op=(path,body)=>call(db,path,'POST',body,operatorHeaders,operatorEnv);
  assert.equal((await op(`/api/operator/requests/${ref}/quotes`,quoteBody(1))).status,409);
  const start=await op(`/api/operator/requests/${ref}/review`,{action:'START_REVIEW',expectedVersion:1});assert.equal(start.status,200);assert.equal(start.body.status,'UNDER_REVIEW');
  const stale=await op(`/api/operator/requests/${ref}/review`,{action:'START_REVIEW',expectedVersion:1});assert.equal(stale.status,409);
  assert.equal((await op(`/api/operator/requests/${ref}/review`,{action:'VERIFY',expectedVersion:2,verifiedTitle:'Test bag',supplierName:'QA Supplier',priceCnyFen:0,moq:100,domesticFreightCnyFen:500,leadTimeDays:12})).status,400);
  const verified=await op(`/api/operator/requests/${ref}/review`,{action:'VERIFY',expectedVersion:2,verifiedTitle:'Verified cotton tote bag',supplierName:'QA Supplier',supplierUrl:'https://supplier.example.com/',priceCnyFen:1200,moq:100,domesticFreightCnyFen:500,leadTimeDays:12,internalNotes:'Checked manually for QA.'});
  assert.equal(verified.status,200,JSON.stringify(verified.body));assert.equal(verified.body.status,'VERIFIED');
  const first=await op(`/api/operator/requests/${ref}/quotes`,quoteBody(3));assert.equal(first.status,201,JSON.stringify(first.body));assert.equal(first.body.quote_version,1);
  const second=await op(`/api/operator/requests/${ref}/quotes`,quoteBody(4,13000));assert.equal(second.status,201,JSON.stringify(second.body));assert.equal(second.body.quote_version,2);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM quotes').get().n,2);
  assert.throws(()=>db.sqlite.prepare('UPDATE quotes SET total_minor=1 WHERE version=1').run(),/immutable/);
  assert.throws(()=>db.sqlite.prepare('UPDATE quote_items SET amount_minor=1').run(),/immutable/);
  assert.throws(()=>db.sqlite.prepare("UPDATE events SET type='REWRITTEN'").run(),/immutable/);
  const badVersion=await call(db,`/api/procurement-requests/${ref}/actions`,'POST',{action:'APPROVE',expectedVersion:5,quoteVersion:1},customerHeaders(p.accessToken));assert.equal(badVersion.status,409);
  const question=await call(db,`/api/procurement-requests/${ref}/actions`,'POST',{action:'QUESTION',expectedVersion:5,quoteVersion:2,message:'Can the packaging be changed?'},customerHeaders(p.accessToken));
  assert.equal(question.status,200);assert.equal(question.body.status,'QUOTED');
  const approve=await call(db,`/api/procurement-requests/${ref}/actions`,'POST',{action:'APPROVE',expectedVersion:6,quoteVersion:2},customerHeaders(p.accessToken));
  assert.equal(approve.status,200,JSON.stringify(approve.body));assert.equal(approve.body.status,'CUSTOMER_APPROVED');
  assert.equal((await op(`/api/operator/requests/${ref}/quotes`,quoteBody(7,14000))).status,409);
  const view=await call(db,'/api/procurement-requests/'+ref,'GET',undefined,customerHeaders(p.accessToken));
  assert.equal(view.body.quotes.length,2);assert.equal(view.body.request.current_quote_version,2);
  assert.ok(view.body.events.some(e=>e.type==='CUSTOMER_APPROVED'&&e.quote_version===2));
  assert.ok(!JSON.stringify(view.body).includes('Checked manually for QA.'));
  assert.ok(!JSON.stringify(view.body).includes('price_cny_fen'));
  const notifications=await call(db,'/api/operator/notifications','GET',undefined,operatorHeaders,operatorEnv);
  assert.ok(notifications.body.notifications.some(n=>n.type==='CUSTOMER_QUESTION'&&n.status==='PENDING_MANUAL'));
  assert.ok(notifications.body.notifications.some(n=>n.type==='CUSTOMER_APPROVED'));
});

test('needs-information loop and customer decline enforce transitions',async()=>{
  const db=await database(),{p,ref}=await make(db);
  const op=(body)=>call(db,`/api/operator/requests/${ref}/review`,'POST',body,operatorHeaders,operatorEnv);
  await op({action:'START_REVIEW',expectedVersion:1});
  const need=await op({action:'REQUEST_INFORMATION',expectedVersion:2,message:'Confirm the material composition.'});assert.equal(need.body.status,'NEEDS_INFORMATION');
  assert.equal((await op({action:'VERIFY',expectedVersion:3})).status,409);
  const answer=await call(db,`/api/procurement-requests/${ref}/actions`,'POST',{action:'PROVIDE_INFORMATION',expectedVersion:3,message:'100% cotton.'},customerHeaders(p.accessToken));assert.equal(answer.body.status,'UNDER_REVIEW');
  await op({action:'VERIFY',expectedVersion:4,verifiedTitle:'Tote',supplierName:'Supplier',priceCnyFen:1000,moq:100,domesticFreightCnyFen:200,leadTimeDays:10});
  const quote=await call(db,`/api/operator/requests/${ref}/quotes`,'POST',quoteBody(5),operatorHeaders,operatorEnv);assert.equal(quote.status,201);
  const decline=await call(db,`/api/procurement-requests/${ref}/actions`,'POST',{action:'DECLINE',expectedVersion:6,quoteVersion:1,message:'Target price exceeded.'},customerHeaders(p.accessToken));assert.equal(decline.body.status,'CUSTOMER_DECLINED');
  assert.equal((await call(db,`/api/procurement-requests/${ref}/actions`,'POST',{action:'APPROVE',expectedVersion:7,quoteVersion:1},customerHeaders(p.accessToken))).status,409);
});

test('validation, hourly rate limit, CORS and database failure do not claim saved requests',async()=>{
  const db=await database();
  for(const change of [{name:''},{email:'',whatsapp:''},{productUrl:'javascript:alert(1)'},{productUrl:'http://localhost/item'},
    {productUrl:'',productName:''},{quantity:0},{qcRequirement:'UNKNOWN'},{consent:false},{accessToken:'short'},
    {variantSpecification:'x'.repeat(501)},{website:'bot'}]){
    const p={...good(),...change};const r=await call(db,'/api/procurement-requests','POST',p);assert.equal(r.status,400,JSON.stringify(change));
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM procurement_requests').get().n,0);
  const preflight=await worker.fetch(new Request(origin+'/api/procurement-requests',{method:'OPTIONS',headers:{Origin:'https://nexverified.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type, authorization'}}),{DB:db.DB},{});
  assert.equal(preflight.status,204);assert.match(preflight.headers.get('access-control-allow-headers'),/Authorization/);
  for(let i=0;i<20;i++)assert.equal((await call(db,'/api/procurement-requests','POST',good())).status,201);
  assert.equal((await call(db,'/api/procurement-requests','POST',good())).status,429);
  const broken=await database();broken.failOn(2);const result=await call(broken,'/api/procurement-requests','POST',good());assert.equal(result.status,503);
  assert.equal(broken.sqlite.prepare('SELECT COUNT(*) n FROM customers').get().n,0);
  assert.equal(broken.sqlite.prepare('SELECT COUNT(*) n FROM procurement_requests').get().n,0);
  assert.equal((await call({DB:null},'/api/procurement-requests','POST',good())).status,503);
});
