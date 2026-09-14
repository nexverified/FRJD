import { createPages, aliases } from './pages.mjs';
const pages=createPages();
const manual='Automatic product retrieval is unavailable for this listing. Submit the product link and FRJD will review it manually.';
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"};
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{...security,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
function publicConfig(env){return {contactEmail:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.FRJD_CONTACT_EMAIL||'')?env.FRJD_CONTACT_EMAIL:'',whatsappNumber:/^\+?[\d\s().-]{7,32}$/.test(env.FRJD_WHATSAPP_NUMBER||'')?env.FRJD_WHATSAPP_NUMBER:''};}
async function digest(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function readBody(request){
  if(!request.headers.get('content-type')?.includes('application/json'))throw Object.assign(Error('Use JSON for this request.'),{status:415});
  if(Number(request.headers.get('content-length'))>20000)throw Object.assign(Error('Request is too large.'),{status:413});
  const reader=request.body?.getReader();if(!reader)throw Object.assign(Error('A request body is required.'),{status:400});
  let length=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>20000){await reader.cancel();throw Object.assign(Error('Request is too large.'),{status:413});}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(Error('The request contains invalid JSON.'),{status:400});}
}
export function validate(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid request.');
  const limits={kind:20,name:100,company:160,email:254,whatsapp:32,productUrl:2048,productName:300,destination:100,postalCode:24,targetPrice:80,service:100,notes:5000,subject:200,shipmentReference:120,idempotencyKey:80};
  const p={};for(const [key,max] of Object.entries(limits)){if(input[key]!=null&&typeof input[key]!=='string')throw Error('Invalid '+key+'.');p[key]=(input[key]||'').trim();if(p[key].length>max)throw Error(key+' is too long.');if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(p[key]))throw Error('Invalid characters in '+key+'.');}
  if(input.website)throw Error('Unable to accept this request.');
  if(!['quote','contact','tracking'].includes(p.kind))throw Error('Choose a valid request type.');
  if(!p.name)throw Error('Your name is required.');
  if(!p.email&&!p.whatsapp)throw Error('Provide an email address or WhatsApp number.');
  if(p.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))throw Error('Provide a valid email address.');
  if(p.whatsapp&&!/^\+?[\d\s().-]{7,32}$/.test(p.whatsapp))throw Error('Provide a valid WhatsApp number with country code.');
  if(input.consent!==true)throw Error('Please agree to the privacy notice and terms.');
  if(!/^[a-f0-9-]{36}$/i.test(p.idempotencyKey))throw Error('Invalid submission identifier. Reload the page and retry.');
  if(p.productUrl){try{const u=new URL(p.productUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!u.hostname.includes('.'))throw Error();}catch{throw Error('Provide a full http or https product URL without login credentials.');}}
  if(p.kind==='quote'){
    if(!p.productUrl&&!p.productName)throw Error('Provide a product link or product description.');
    p.quantity=Number(input.quantity);if(!Number.isInteger(p.quantity)||p.quantity<1||p.quantity>100000000)throw Error('Quantity must be a whole number between 1 and 100,000,000.');
    if(!p.destination)throw Error('Destination country is required.');
  }
  if(p.kind==='contact'&&(!p.subject||!p.notes))throw Error('Subject and message are required.');
  if(p.kind==='tracking'&&!p.shipmentReference)throw Error('Shipment or order reference is required.');
  p.consent=true;return p;
}
async function submit(request,env){
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({success:false,error:'Please submit through this website.'},403);
  if(!env.DB)return json({success:false,error:'Enquiries are temporarily unavailable. Your request has not been saved. Please try again later.'},503);
  let p;try{p=validate(await readBody(request));}catch(e){return json({success:false,error:e.message},e.status||400);}
  const serialized=JSON.stringify(p);const hash=await digest(serialized);
  const existing=await env.DB.prepare('SELECT id, payload_hash FROM enquiries WHERE idempotency_key = ?').bind(p.idempotencyKey).first();
  if(existing)return existing.payload_hash===hash?json({success:true,request_id:existing.id,status:'pending',duplicate:true}):json({success:false,error:'This submission identifier has already been used with different details. Reload and submit a new request.'},409);
  const now=Date.now();const bucket=Math.floor(now/3600000);const ip=request.headers.get('CF-Connecting-IP')||'local';const key=await digest(ip+':'+bucket);
  const count=await env.DB.prepare('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+3600000).first();
  if(count.count>20)return json({success:false,error:'Too many requests. Please try again later.'},429);
  const id='FRJD-'+crypto.randomUUID().toUpperCase();
  await env.DB.prepare('INSERT INTO enquiries (id,idempotency_key,payload_hash,kind,payload,created_at,status) VALUES (?,?,?,?,?,?,?) ON CONFLICT(idempotency_key) DO NOTHING').bind(id,p.idempotencyKey,hash,p.kind,serialized,now,'pending').run();
  const saved=await env.DB.prepare('SELECT id,payload_hash FROM enquiries WHERE idempotency_key=?').bind(p.idempotencyKey).first();
  if(!saved)throw Error('Save was not confirmed');
  if(saved.payload_hash!==hash)return json({success:false,error:'Submission details conflict with a previous request.'},409);
  return json({success:true,request_id:saved.id,status:'pending'},201);
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);const path=url.pathname;
    try{
      if(path==='/api/config'&&request.method==='GET')return json(publicConfig(env));
      if(path==='/api/submit-quote'){if(request.method!=='POST')return json({error:'Method not allowed'},405);return await submit(request,env);}
      if(path==='/api/resolve-product'&&request.method==='POST')return json({source:'manual_intake',available:false,message:manual});
      if(path==='/api/track'&&request.method==='POST')return json({available:false,source:'manual_update',message:'Live tracking is not connected. Request a manual shipment update.'});
      if(path==='/api/quote/estimate'&&request.method==='POST')return json({available:false,source:'manual_quote',message:'Submit a request for a written quotation.'});
      if(path==='/api/admin/enquiries'){
        if(request.method!=='GET')return json({error:'Method not allowed'},405);
        const auth=request.headers.get('authorization')||'';
        if(!env.FRJD_ADMIN_TOKEN||await digest(auth)!==await digest('Bearer '+env.FRJD_ADMIN_TOKEN))return json({error:'Unauthorized'},401);
        if(!env.DB)return json({error:'Storage unavailable'},503);
        const rows=await env.DB.prepare('SELECT id,kind,payload,created_at,status FROM enquiries ORDER BY created_at DESC LIMIT 100').all();
        return json({enquiries:rows.results.map(r=>({...r,payload:JSON.parse(r.payload)}))});
      }
      if(path.startsWith('/api/'))return json({error:'Not found'},404);
      if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);
      const origin=env.FRJD_SITE_ORIGIN||url.origin;
      if(path==='/robots.txt')return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`,{headers:{...security,'Content-Type':'text/plain'}});
      if(path==='/sitemap.xml')return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(pages).filter(p=>p!=='404.html').map(p=>`<url><loc>${origin}/${p==='index.html'?'':p}</loc></url>`).join('')}</urlset>`,{headers:{...security,'Content-Type':'application/xml'}});
      const name=path==='/'?'index.html':path.slice(1);
      if(aliases[name])return new Response(null,{status:301,headers:{...security,Location:'/'+aliases[name]}});
      if(path==='/index.html')return new Response(null,{status:301,headers:{...security,Location:'/'}});
      if(pages[name])return new Response(request.method==='HEAD'?null:pages[name].replaceAll('__SITE_ORIGIN__',origin),{status:name==='404.html'?404:200,headers:{...security,'Content-Type':'text/html; charset=utf-8','Cache-Control':'public,max-age=60'}});
      if(/^\/(assets\/(warehouse_storefront|pallet_packages|business_license)\.jpg|release\/(site\.css|client\.js)|favicon\.svg)$/.test(path)&&env.ASSETS){const r=await env.ASSETS.fetch(request);const headers=new Headers(r.headers);Object.entries(security).forEach(([k,v])=>headers.set(k,v));return new Response(r.body,{status:r.status,headers});}
      return new Response(request.method==='HEAD'?null:pages['404.html'].replaceAll('__SITE_ORIGIN__',origin),{status:404,headers:{...security,'Content-Type':'text/html; charset=utf-8'}});
    }catch(error){console.error('FRJD request failed',path,error?.name||'Error');return json({success:false,error:'The service could not confirm your request. Your entries are still available; please retry.'},503);}
  }
};
