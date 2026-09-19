// Persistent Sprint 1 procurement workflow. URLs are recorded, never fetched.
const statuses=new Set(['DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_INFORMATION','VERIFIED','QUOTED','CUSTOMER_APPROVED','CUSTOMER_DECLINED']);
const quoteCategories=new Set(['GOODS','CHINA_FREIGHT','SERVICE','QC','WAREHOUSE','INTERNATIONAL_FREIGHT','OTHER']);
const qcChoices=new Set(['NONE','BASIC','DETAILED','DISCUSS']);
const platformDomains=[['1688','1688.com'],['taobao','taobao.com'],['tmall','tmall.com'],['alibaba','alibaba.com'],['jd','jd.com'],['weidian','weidian.com'],['pinduoduo','pinduoduo.com'],['pinduoduo','yangkeduo.com']];
const fail=(message,status=400)=>{const error=new Error(message);error.status=status;throw error;};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const uuid=()=>crypto.randomUUID();
const reference=()=>`FRJD-PR-${uuid().replaceAll('-','').slice(0,12).toUpperCase()}`;
const createdAt=()=>Date.now();
export async function sha256(value){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
function sameHash(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function string(input,key,max,{required=false}={}){const value=input[key]??'';if(typeof value!=='string')fail(`Invalid ${key}.`);const trimmed=value.trim();if(trimmed.length>max||/[\u0000-\u001f\u007f]/.test(trimmed))fail(`Invalid ${key}.`);if(required&&!trimmed)fail(`${key} is required.`);return trimmed;}
function positiveInteger(value,key,max=100000000){const number=Number(value);if(!Number.isSafeInteger(number)||number<1||number>max)fail(`Invalid ${key}.`);return number;}
function nonnegativeInteger(value,key,max=100000000000){const number=Number(value);if(!Number.isSafeInteger(number)||number<0||number>max)fail(`Invalid ${key}.`);return number;}
function email(value){if(value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))fail('Provide a valid email address.');return value;}
function whatsapp(value){if(value&&!/^\+?[\d\s().-]{7,32}$/.test(value))fail('Provide a valid WhatsApp number with country code.');return value;}
export function normalizeProductUrl(raw){
  if(typeof raw!=='string'||raw.length>2048||/[\s\u0000-\u001f\u007f]/.test(raw))fail('Provide a valid product URL.');
  if(!raw)return {url:'',platform:'unknown'};
  let parsed;try{parsed=new URL(raw);}catch{fail('Provide a full http or https product URL.');}
  if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)fail('Only http or https product URLs without embedded credentials are accepted.');
  const host=parsed.hostname.toLowerCase().replace(/\.$/,'');
  if(!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.startsWith('[')||/^\d+\.\d+\.\d+\.\d+$/.test(host)||!host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))fail('Provide a public product hostname.');
  if(parsed.port&&!['80','443'].includes(parsed.port))fail('Product URLs with custom ports are not accepted.');
  parsed.hash='';parsed.hostname=host;
  const platform=platformDomains.find(([,domain])=>host===domain||host.endsWith('.'+domain))?.[0]||'generic';
  return {url:parsed.toString(),platform};
}
export function validateProcurement(input){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid request.');
  if(input.website)fail('Unable to accept this request.');
  const idempotencyKey=string(input,'idempotencyKey',80,{required:true});
  if(!/^[a-f0-9-]{36}$/i.test(idempotencyKey))fail('Invalid submission identifier.');
  const accessToken=string(input,'accessToken',64,{required:true});
  if(!/^[a-f0-9]{64}$/.test(accessToken))fail('Invalid private access token.');
  const name=string(input,'name',100,{required:true}),company=string(input,'company',160);
  const contactEmail=email(string(input,'email',254)),contactWhatsapp=whatsapp(string(input,'whatsapp',32));
  if(!contactEmail&&!contactWhatsapp)fail('Provide an email address or WhatsApp number.');
  const productUrl=normalizeProductUrl(string(input,'productUrl',2048));
  const productName=string(input,'productName',300);
  if(!productUrl.url&&!productName)fail('Provide a product link or description.');
  const destination=string(input,'destination',100,{required:true});
  const qcRequirement=string(input,'qcRequirement',20,{required:true});
  if(!qcChoices.has(qcRequirement))fail('Choose a QC requirement.');
  if(input.consent!==true)fail('Please agree to the privacy notice and terms.');
  return {idempotencyKey,accessToken,name,company,email:contactEmail,whatsapp:contactWhatsapp,
    productUrl:productUrl.url,platform:productUrl.platform,productName,
    quantity:positiveInteger(input.quantity,'quantity'),variantSpecification:string(input,'variantSpecification',500),
    destination,postalCode:string(input,'postalCode',24),targetPrice:string(input,'targetPrice',80),service:string(input,'service',100),
    qcRequirement,notes:string(input,'notes',5000),consent:true};
}
async function readJson(request){
  if(!request.headers.get('content-type')?.toLowerCase().includes('application/json'))fail('Use JSON for this request.',415);
  if(Number(request.headers.get('content-length'))>20000)fail('Request is too large.',413);
  const reader=request.body?.getReader();if(!reader)fail('A request body is required.');
  let length=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>20000){await reader.cancel();fail('Request is too large.',413);}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('The request contains invalid JSON.');}
}
function stmt(db,sql,...args){return db.prepare(sql).bind(...args);}
async function one(db,sql,...args){return stmt(db,sql,...args).first();}
async function all(db,sql,...args){return (await stmt(db,sql,...args).all()).results;}
async function batch(db,statements){if(!db.batch)fail('Transactional storage is unavailable.',503);return db.batch(statements);}
function requireDb(env){if(!env.DB)fail('Requests are temporarily unavailable. Your details have not been saved.',503);return env.DB;}
function authToken(request){const value=request.headers.get('authorization')||'';return value.startsWith('Bearer ')?value.slice(7):'';}
async function operatorAuthorized(request,env){const secret=env.FRJD_ADMIN_TOKEN;if(typeof secret!=='string'||secret.length<32)return false;return sameHash(await sha256(authToken(request)),await sha256(secret));}
async function customerAuthorized(request,row){const token=authToken(request);return /^[a-f0-9]{64}$/.test(token)&&sameHash(await sha256(token),row.access_token_hash);}
function eventStatement(db,{id,ref,type,actor,from,to,quoteVersion=null,publicMessage='',internalMessage='',now,mutationId}){
  return stmt(db,`INSERT INTO events (id,request_id,type,actor_type,from_status,to_status,quote_version,public_message,internal_message,created_at)
    SELECT ?,id,?,?,?,?,?,?,?,? FROM procurement_requests WHERE id=? AND last_mutation_id=?`,
    id,type,actor,from,to,quoteVersion,publicMessage,internalMessage,now,ref,mutationId);
}
function notificationStatement(db,{id,eventId,ref,type,recipient,now}){
  return stmt(db,`INSERT INTO notifications (id,event_id,request_id,type,recipient_role,status,created_at)
    SELECT ?,id,request_id,?,?,'PENDING_MANUAL',? FROM events WHERE id=? AND request_id=?`,id,type,recipient,now,eventId,ref);
}
async function createRequest(request,env){
  const db=requireDb(env),p=validateProcurement(await readJson(request));
  const payload={...p};delete payload.accessToken;
  const hash=await sha256(JSON.stringify({...payload,accessToken:p.accessToken}));
  const existing=await one(db,'SELECT id,payload_hash,created_at,status FROM procurement_requests WHERE idempotency_key=?',p.idempotencyKey);
  if(existing){if(!sameHash(existing.payload_hash,hash))fail('This submission identifier was used with different details.',409);return response({success:true,request_ref:existing.id,submitted_at:existing.created_at,status:existing.status,access_token:p.accessToken,duplicate:true});}
  const ip=request.headers.get('CF-Connecting-IP')||'local';const now=createdAt();const limitKey=await sha256(`procurement:${ip}:${Math.floor(now/3600000)}`);
  const limited=await one(db,'INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',limitKey,now+3600000);
  if(limited.count>20)fail('Too many requests. Please try again later.',429);
  const customerId=uuid(),itemId=uuid(),sourceId=uuid(),eventId=uuid(),notificationId=uuid();
  let ref;
  for(let attempt=0;attempt<3;attempt++){
    ref=reference();
    try{
      const statements=[
        stmt(db,'INSERT INTO customers (id,name,company,email,whatsapp,created_at) VALUES (?,?,?,?,?,?)',customerId,p.name,p.company,p.email,p.whatsapp,now),
        stmt(db,`INSERT INTO procurement_requests (id,customer_id,status,version,current_quote_version,access_token_hash,idempotency_key,payload_hash,destination_country,postal_code,target_price,requested_service,qc_requirement,notes,created_at,updated_at)
          VALUES (?,?,'SUBMITTED',1,NULL,?,?,?,?,?,?,?,?,?,?,?)`,ref,customerId,await sha256(p.accessToken),p.idempotencyKey,hash,p.destination,p.postalCode,p.targetPrice,p.service,p.qcRequirement,p.notes,now,now),
        stmt(db,'INSERT INTO procurement_request_items (id,request_id,description,quantity,variant_specification,notes) VALUES (?,?,?,?,?,?)',itemId,ref,p.productName||'Product link awaiting verification',p.quantity,p.variantSpecification,''),
      ];
      if(p.productUrl)statements.push(stmt(db,'INSERT INTO product_sources (id,request_item_id,url,platform,detection_source,created_at) VALUES (?,?,?,?,?,?)',sourceId,itemId,p.productUrl,p.platform,'url_only',now));
      statements.push(stmt(db,`INSERT INTO events (id,request_id,type,actor_type,from_status,to_status,quote_version,public_message,internal_message,created_at)
        VALUES (?,?,'REQUEST_SUBMITTED','CUSTOMER',NULL,'SUBMITTED',NULL,'Request received. FRJD will review the details.','',?)`,eventId,ref,now));
      statements.push(notificationStatement(db,{id:notificationId,eventId,ref,type:'NEW_REQUEST',recipient:'OPERATOR',now}));
      await batch(db,statements);
      const saved=await one(db,'SELECT id,created_at,status,payload_hash FROM procurement_requests WHERE id=?',ref);
      if(!saved||!sameHash(saved.payload_hash,hash))fail('The request save could not be confirmed.',503);
      return response({success:true,request_ref:ref,submitted_at:now,status:'SUBMITTED',access_token:p.accessToken,
        next_step:'FRJD will verify the product and current purchasing information before preparing your quote.'},201);
    }catch(error){
      const duplicate=await one(db,'SELECT id,payload_hash,created_at,status FROM procurement_requests WHERE idempotency_key=?',p.idempotencyKey);
      if(duplicate){if(!sameHash(duplicate.payload_hash,hash))fail('This submission identifier was used with different details.',409);return response({success:true,request_ref:duplicate.id,submitted_at:duplicate.created_at,status:duplicate.status,access_token:p.accessToken,duplicate:true});}
      if(attempt===2||!/UNIQUE constraint failed: procurement_requests\.id/.test(error.message||''))throw error;
    }
  }
}
async function getRequest(db,ref,{operator=false}={}){
  const row=await one(db,`SELECT r.id,r.status,r.version,r.current_quote_version,r.destination_country,r.postal_code,r.target_price,
    r.requested_service,r.qc_requirement,r.notes,r.created_at,r.updated_at,c.name,c.company,c.email,c.whatsapp
    FROM procurement_requests r JOIN customers c ON c.id=r.customer_id WHERE r.id=?`,ref);
  if(!row)return null;
  const items=await all(db,'SELECT * FROM procurement_request_items WHERE request_id=? ORDER BY rowid',ref);
  const sources=await all(db,'SELECT s.* FROM product_sources s JOIN procurement_request_items i ON i.id=s.request_item_id WHERE i.request_id=?',ref);
  const supplier=await all(db,'SELECT s.* FROM supplier_information s JOIN procurement_request_items i ON i.id=s.request_item_id WHERE i.request_id=?',ref);
  const quoteRows=await all(db,'SELECT * FROM quotes WHERE request_id=? ORDER BY version',ref);
  const quotes=[];for(const quote of quoteRows){quotes.push({...quote,items:await all(db,'SELECT category,description,amount_minor,display_order FROM quote_items WHERE quote_id=? ORDER BY display_order',quote.id)});}
  const events=await all(db,'SELECT id,type,actor_type,from_status,to_status,quote_version,public_message,internal_message,created_at FROM events WHERE request_id=? ORDER BY created_at,id',ref);
  if(operator)return {request:row,items,sources,supplier,quotes,events};
  return {request:{ref:row.id,status:row.status,version:row.version,current_quote_version:row.current_quote_version,
    submitted_at:row.created_at,updated_at:row.updated_at,destination_country:row.destination_country,postal_code:row.postal_code,
    target_price:row.target_price,requested_service:row.requested_service,qc_requirement:row.qc_requirement,notes:row.notes,name:row.name,company:row.company},
    items:items.map(i=>({description:i.description,quantity:i.quantity,variant_specification:i.variant_specification})),
    sources:sources.map(s=>({url:s.url,platform:s.platform,detection_source:s.detection_source})),
    verified:supplier.map(s=>({verified_title:s.verified_title,supplier_name:s.supplier_name,moq:s.moq,lead_time_days:s.lead_time_days,verified_at:s.verified_at})),
    quotes:quotes.map(q=>({id:q.id,version:q.version,currency:q.currency,total_minor:q.total_minor,valid_until:q.valid_until,
      customer_notes:q.customer_notes,published_at:q.published_at,items:q.items})),
    events:events.filter(e=>e.public_message).map(e=>({type:e.type,actor_type:e.actor_type,from_status:e.from_status,to_status:e.to_status,
      quote_version:e.quote_version,message:e.public_message,created_at:e.created_at}))};
}
function expectedVersion(p){return positiveInteger(p.expectedVersion,'expectedVersion',1000000000);}
function validRef(ref){if(!/^FRJD-PR-[A-F0-9]{12}$/.test(ref))fail('Request not found.',404);return ref;}
async function customerView(request,env,ref){const db=requireDb(env),row=await one(db,'SELECT access_token_hash FROM procurement_requests WHERE id=?',validRef(ref));
  if(!row||!await customerAuthorized(request,row))fail('Unauthorized.',401);return response(await getRequest(db,ref));}
async function customerAction(request,env,ref){
  const db=requireDb(env),row=await one(db,'SELECT status,version,current_quote_version,access_token_hash FROM procurement_requests WHERE id=?',validRef(ref));
  if(!row||!await customerAuthorized(request,row))fail('Unauthorized.',401);
  const p=await readJson(request),version=expectedVersion(p),action=string(p,'action',32,{required:true});
  if(version!==row.version)fail('Request changed. Reload before taking action.',409);
  let to=row.status,type,publicMessage,notificationType,recipient='OPERATOR',quoteVersion=null;
  if(action==='PROVIDE_INFORMATION'){
    if(row.status!=='NEEDS_INFORMATION')fail('This request is not waiting for information.',409);
    publicMessage=string(p,'message',3000,{required:true});to='UNDER_REVIEW';type='INFORMATION_PROVIDED';notificationType='INFORMATION_PROVIDED';
  }else if(['APPROVE','DECLINE','QUESTION'].includes(action)){
    if(row.status!=='QUOTED')fail('There is no current quote to act on.',409);
    quoteVersion=positiveInteger(p.quoteVersion,'quoteVersion',10000);
    if(quoteVersion!==row.current_quote_version)fail('This quote has changed. Reload before taking action.',409);
    const quote=await one(db,'SELECT valid_until FROM quotes WHERE request_id=? AND version=?',ref,quoteVersion);
    if(!quote)fail('Quote not found.',404);
    if(action==='APPROVE'&&Date.parse(quote.valid_until+'T23:59:59.999Z')<Date.now())fail('This quote has expired. Ask FRJD for a current quote.',409);
    if(action==='QUESTION'){publicMessage=string(p,'message',3000,{required:true});type='CUSTOMER_QUESTION';notificationType='CUSTOMER_QUESTION';}
    if(action==='APPROVE'){to='CUSTOMER_APPROVED';type='CUSTOMER_APPROVED';publicMessage=`Customer approved quote version ${quoteVersion}.`;notificationType='CUSTOMER_APPROVED';}
    if(action==='DECLINE'){to='CUSTOMER_DECLINED';type='CUSTOMER_DECLINED';publicMessage=string(p,'message',3000)||`Customer declined quote version ${quoteVersion}.`;notificationType='CUSTOMER_DECLINED';}
  }else fail('Unsupported customer action.');
  const now=createdAt(),mutationId=uuid(),eventId=uuid(),notificationId=uuid();
  const updates=[stmt(db,`UPDATE procurement_requests SET status=?,version=version+1,last_mutation_id=?,updated_at=?
    WHERE id=? AND status=? AND version=? AND (current_quote_version IS ? OR current_quote_version=?) RETURNING id`,
    to,mutationId,now,ref,row.status,version,quoteVersion,quoteVersion)];
  // Information responses do not relate to a quote; the existing quote version must be NULL.
  updates.push(eventStatement(db,{id:eventId,ref,type,actor:'CUSTOMER',from:row.status,to,quoteVersion,publicMessage,now,mutationId}));
  updates.push(notificationStatement(db,{id:notificationId,eventId,ref,type:notificationType,recipient,now}));
  const result=await batch(db,updates);if(!result[0]?.results?.length)fail('Request changed. Reload before taking action.',409);
  return response({success:true,status:to,version:version+1,quote_version:quoteVersion,at:now});
}
async function operatorView(request,env,ref){if(!await operatorAuthorized(request,env))fail('Unauthorized.',401);const db=requireDb(env),data=await getRequest(db,validRef(ref),{operator:true});if(!data)fail('Request not found.',404);return response(data);}
async function operatorList(request,env){if(!await operatorAuthorized(request,env))fail('Unauthorized.',401);const db=requireDb(env),url=new URL(request.url),status=url.searchParams.get('status')||'';
  if(status&&!statuses.has(status))fail('Invalid status filter.');
  const rows=status?await all(db,`SELECT r.id,r.status,r.version,r.created_at,r.updated_at,c.name,c.company FROM procurement_requests r JOIN customers c ON c.id=r.customer_id WHERE r.status=? ORDER BY r.created_at DESC LIMIT 100`,status)
    :await all(db,`SELECT r.id,r.status,r.version,r.created_at,r.updated_at,c.name,c.company FROM procurement_requests r JOIN customers c ON c.id=r.customer_id ORDER BY r.created_at DESC LIMIT 100`);
  return response({requests:rows,limit:100});}
async function operatorReview(request,env,ref){
  if(!await operatorAuthorized(request,env))fail('Unauthorized.',401);const db=requireDb(env),p=await readJson(request),action=string(p,'action',32,{required:true}),version=expectedVersion(p);
  const row=await one(db,'SELECT status,version FROM procurement_requests WHERE id=?',validRef(ref));if(!row)fail('Request not found.',404);
  if(row.version!==version)fail('Request changed. Reload before editing.',409);
  let to,type,publicMessage='',internalMessage=string(p,'internalNotes',3000),supplier=null;
  if(action==='START_REVIEW'&&row.status==='SUBMITTED'){to='UNDER_REVIEW';type='REVIEW_STARTED';publicMessage='FRJD is reviewing your request.';}
  else if(action==='REQUEST_INFORMATION'&&row.status==='UNDER_REVIEW'){to='NEEDS_INFORMATION';type='INFORMATION_REQUESTED';publicMessage=string(p,'message',3000,{required:true});}
  else if(action==='VERIFY'&&row.status==='UNDER_REVIEW'){
    to='VERIFIED';type='PRODUCT_VERIFIED';publicMessage='Product and supplier information has been reviewed. FRJD is preparing a quote.';
    supplier={verifiedTitle:string(p,'verifiedTitle',300,{required:true}),supplierName:string(p,'supplierName',200,{required:true}),
      supplierUrl:string(p,'supplierUrl',2048),priceCnyFen:positiveInteger(p.priceCnyFen,'priceCnyFen',100000000000),
      moq:positiveInteger(p.moq,'moq'),domesticFreightCnyFen:nonnegativeInteger(p.domesticFreightCnyFen,'domesticFreightCnyFen'),
      leadTimeDays:nonnegativeInteger(p.leadTimeDays,'leadTimeDays',10000)};
    if(supplier.supplierUrl)supplier.supplierUrl=normalizeProductUrl(supplier.supplierUrl).url;
  }else fail('Invalid review transition.',409);
  const now=createdAt(),mutationId=uuid(),eventId=uuid();
  const statements=[stmt(db,`UPDATE procurement_requests SET status=?,version=version+1,last_mutation_id=?,updated_at=? WHERE id=? AND status=? AND version=? RETURNING id`,to,mutationId,now,ref,row.status,version)];
  if(supplier)statements.push(stmt(db,`INSERT INTO supplier_information (request_item_id,verified_title,supplier_name,supplier_url,price_cny_fen,moq,domestic_freight_cny_fen,lead_time_days,internal_notes,verified_at)
    SELECT i.id,?,?,?,?,?,?,?,?,? FROM procurement_request_items i JOIN procurement_requests r ON r.id=i.request_id WHERE r.id=? AND r.last_mutation_id=? ORDER BY i.rowid LIMIT 1`,
    supplier.verifiedTitle,supplier.supplierName,supplier.supplierUrl,supplier.priceCnyFen,supplier.moq,supplier.domesticFreightCnyFen,supplier.leadTimeDays,internalMessage,now,ref,mutationId));
  statements.push(eventStatement(db,{id:eventId,ref,type,actor:'OPERATOR',from:row.status,to,publicMessage,internalMessage,now,mutationId}));
  if(action==='REQUEST_INFORMATION')statements.push(notificationStatement(db,{id:uuid(),eventId,ref,type:'NEEDS_INFORMATION',recipient:'CUSTOMER',now}));
  const result=await batch(db,statements);if(!result[0]?.results?.length)fail('Request changed. Reload before editing.',409);
  return response({success:true,status:to,version:version+1,at:now});
}
function validateQuote(p){
  const currency=string(p,'currency',3,{required:true}).toUpperCase();if(!['CNY','USD','EUR','GBP','INR'].includes(currency))fail('Choose a supported currency.');
  const validUntil=string(p,'validUntil',10,{required:true});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)||Number.isNaN(Date.parse(validUntil+'T00:00:00Z'))||new Date(validUntil+'T00:00:00Z').toISOString().slice(0,10)!==validUntil||Date.parse(validUntil+'T23:59:59.999Z')<Date.now())fail('Choose a current or future quote validity date.');
  if(!Array.isArray(p.items)||p.items.length<1||p.items.length>20)fail('Provide 1 to 20 quote items.');
  const items=p.items.map((item,i)=>{if(!item||typeof item!=='object'||Array.isArray(item))fail('Invalid quote item.');
    const category=string(item,'category',32,{required:true});if(!quoteCategories.has(category))fail('Invalid quote category.');
    return {category,description:string(item,'description',300,{required:true}),amountMinor:nonnegativeInteger(item.amountMinor,'amountMinor'),displayOrder:i};});
  const total=items.reduce((sum,item)=>sum+item.amountMinor,0);if(!Number.isSafeInteger(total)||total<1||total>100000000000)fail('Quote total must be positive and within range.');
  return {currency,validUntil,items,total,customerNotes:string(p,'customerNotes',3000),operatorNotes:string(p,'operatorNotes',3000)};
}
async function operatorQuote(request,env,ref){
  if(!await operatorAuthorized(request,env))fail('Unauthorized.',401);const db=requireDb(env),p=await readJson(request),expected=expectedVersion(p),q=validateQuote(p);
  const row=await one(db,'SELECT status,version,current_quote_version FROM procurement_requests WHERE id=?',validRef(ref));if(!row)fail('Request not found.',404);
  if(!['VERIFIED','QUOTED'].includes(row.status)||row.version!==expected)fail('Request changed or is not ready for a quote.',409);
  const supplier=await one(db,`SELECT s.request_item_id FROM supplier_information s JOIN procurement_request_items i ON i.id=s.request_item_id WHERE i.request_id=?`,ref);
  if(!supplier)fail('Verify product and supplier information before quoting.',409);
  const quoteVersion=(row.current_quote_version||0)+1,quoteId=uuid(),eventId=uuid(),now=createdAt(),mutationId=uuid();
  const statements=[stmt(db,`INSERT INTO quotes (id,request_id,version,currency,total_minor,valid_until,operator_notes,customer_notes,published_at)
    SELECT ?,id,?,?,?,?,?,?,? FROM procurement_requests WHERE id=? AND status=? AND version=? AND COALESCE(current_quote_version,0)=?`,
    quoteId,quoteVersion,q.currency,q.total,q.validUntil,q.operatorNotes,q.customerNotes,now,ref,row.status,expected,row.current_quote_version||0)];
  for(const item of q.items)statements.push(stmt(db,`INSERT INTO quote_items (id,quote_id,category,description,amount_minor,display_order)
    SELECT ?,id,?,?,?,? FROM quotes WHERE id=?`,uuid(),item.category,item.description,item.amountMinor,item.displayOrder,quoteId));
  statements.push(stmt(db,`UPDATE procurement_requests SET status='QUOTED',version=version+1,current_quote_version=?,last_mutation_id=?,updated_at=?
    WHERE id=? AND status=? AND version=? AND EXISTS(SELECT 1 FROM quotes WHERE id=?) RETURNING id`,quoteVersion,mutationId,now,ref,row.status,expected,quoteId));
  statements.push(eventStatement(db,{id:eventId,ref,type:quoteVersion===1?'QUOTE_PUBLISHED':'QUOTE_REVISED',actor:'OPERATOR',from:row.status,to:'QUOTED',quoteVersion,
    publicMessage:`Quote version ${quoteVersion} is ready for your review.`,internalMessage:q.operatorNotes,now,mutationId}));
  statements.push(notificationStatement(db,{id:uuid(),eventId,ref,type:'QUOTE_READY',recipient:'CUSTOMER',now}));
  const results=await batch(db,statements);if(!results[0]?.results?.length&&!await one(db,'SELECT id FROM quotes WHERE id=?',quoteId))fail('Request changed. Reload before quoting.',409);
  const updated=results[1+q.items.length];if(!updated?.results?.length)fail('Quote publication could not be confirmed.',503);
  return response({success:true,request_ref:ref,quote_version:quoteVersion,status:'QUOTED',total_minor:q.total,currency:q.currency,at:now},201);
}
export async function handleTransaction(request,env,path){
  try{
    const method=request.method;
    if(path==='/api/procurement-requests'&&method==='POST')return await createRequest(request,env);
    if(path==='/api/operator/requests'&&method==='GET')return await operatorList(request,env);
    if(path==='/api/operator/notifications'&&method==='GET'){
      if(!await operatorAuthorized(request,env))fail('Unauthorized.',401);const db=requireDb(env);
      return response({notifications:await all(db,'SELECT id,request_id,type,recipient_role,status,created_at FROM notifications ORDER BY created_at DESC LIMIT 100')});
    }
    if(path==='/api/operator/legacy-enquiries'&&method==='GET'){
      if(!await operatorAuthorized(request,env))fail('Unauthorized.',401);const db=requireDb(env);
      return response({enquiries:await all(db,'SELECT id,kind,payload,created_at,status FROM enquiries ORDER BY created_at DESC LIMIT 100')});
    }
    const customer=path.match(/^\/api\/procurement-requests\/(FRJD-PR-[A-F0-9]{12})(?:\/(actions))?$/);
    if(customer){if(method==='GET'&&!customer[2])return await customerView(request,env,customer[1]);if(method==='POST'&&customer[2])return await customerAction(request,env,customer[1]);}
    const operator=path.match(/^\/api\/operator\/requests\/(FRJD-PR-[A-F0-9]{12})(?:\/(review|quotes))?$/);
    if(operator){if(method==='GET'&&!operator[2])return await operatorView(request,env,operator[1]);if(method==='POST'&&operator[2]==='review')return await operatorReview(request,env,operator[1]);if(method==='POST'&&operator[2]==='quotes')return await operatorQuote(request,env,operator[1]);}
    return response({error:'Not found.'},404);
  }catch(error){
    if(error.status)return response({success:false,error:error.message},error.status);
    console.error('FRJD transaction failed',path,error?.name||'Error');
    return response({success:false,error:'The service could not confirm this change. Please retry after checking the current state.'},503);
  }
}
