(() => {
  const M={queue:'Procurement queue',notifications:'Manual notification queue',legacy:'Earlier enquiries (read-only)',
    review:'Start review',need:'Request more information',verify:'Record verified information',quote:'Publish quote',
    noDelivery:'PENDING_MANUAL means a record is queued. No email or WhatsApp was sent by this application.'};
  const auth=document.querySelector('#ops-auth'),app=document.querySelector('#ops-app'),status=document.querySelector('#ops-status');
  let token='';let selected=null;
  const node=(tag,value,cls)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value);if(cls)e.className=cls;return e;};
  const labeled=(label,type='text',required=false)=>{const wrap=node('label');wrap.append(node('span',label));const input=node('input');input.type=type;input.required=required;wrap.append(input);return {wrap,input};};
  const textarea=label=>{const wrap=node('label');wrap.append(node('span',label));const input=node('textarea');input.maxLength=3000;wrap.append(input);return {wrap,input};};
  const show=message=>{status.textContent=message;};
  const money=(minor,currency)=>new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(minor/100);
  function parseMinor(value){if(!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))throw Error('Enter an amount with up to two decimal places.');const [units,decimals='']=value.trim().split('.');const n=Number(units)*100+Number(decimals.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>100000000000)throw Error('Amount is outside the allowed range.');return n;}
  async function api(path,{method='GET',body}={}){
    const response=await fetch(path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    const value=await response.json();if(!response.ok)throw Error(value.error||'The operation failed.');return value;
  }
  async function mutate(path,body){try{show('Saving…');await api(path,{method:'POST',body});show('Saved. The event is in the request history.');await open(selected.request.id);await loadList();}catch(err){show(err.message);}}
  const line=(parent,label,value)=>{const p=node('p');p.append(node('strong',label+': '),document.createTextNode(String(value??'—')));parent.append(p);};
  function detail(data){selected=data;const old=app.querySelector('#ops-detail');old?.remove();const box=node('section',undefined,'request-card');box.id='ops-detail';
    const request=data.request;box.append(node('h2',request.id));line(box,'Status',request.status);line(box,'Version',request.version);
    line(box,'Customer',request.name+(request.company?' · '+request.company:''));line(box,'Email',request.email);line(box,'WhatsApp',request.whatsapp);
    line(box,'Destination',request.destination_country+' '+request.postal_code);line(box,'QC',request.qc_requirement);line(box,'Service',request.requested_service);
    line(box,'Target price',request.target_price);line(box,'Notes',request.notes);
    for(const item of data.items){line(box,'Product',item.description);line(box,'Quantity',item.quantity);line(box,'Variant',item.variant_specification);}
    for(const source of data.sources){line(box,'Detected platform',source.platform);const p=node('p');p.append(node('strong','Source URL: '));const link=node('a',source.url);link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';p.append(link);box.append(p);}
    if(data.supplier.length){const s=data.supplier[0];const section=node('section',undefined,'ops-panel');section.append(node('h3','Recorded verification'));for(const [label,value] of [['Product title',s.verified_title],['Supplier',s.supplier_name],['Supplier URL',s.supplier_url],['Current RMB price',money(s.price_cny_fen,'CNY')],['MOQ',s.moq],['China domestic freight',money(s.domestic_freight_cny_fen,'CNY')],['Lead time days',s.lead_time_days],['Internal notes',s.internal_notes]])line(section,label,value);box.append(section);}
    if(request.status==='SUBMITTED'){
      const button=node('button',M.review,'btn');button.type='button';button.addEventListener('click',()=>mutate(`/api/operator/requests/${request.id}/review`,{action:'START_REVIEW',expectedVersion:request.version}));box.append(button);
    }
    if(request.status==='UNDER_REVIEW'){
      const info=node('section',undefined,'ops-panel');info.append(node('h3',M.need));const question=textarea('Question for the customer');const note=textarea('Internal note');info.append(question.wrap,note.wrap);const ask=node('button','Record information request','btn secondary');ask.type='button';ask.addEventListener('click',()=>mutate(`/api/operator/requests/${request.id}/review`,{action:'REQUEST_INFORMATION',expectedVersion:request.version,message:question.input.value,internalNotes:note.input.value}));info.append(ask);box.append(info);
      const verified=node('section',undefined,'ops-panel');verified.append(node('h3',M.verify));const fields={};for(const [key,label,type,required] of [['verifiedTitle','Verified product title','text',true],['supplierName','Supplier name','text',true],['supplierUrl','Supplier URL (optional)','url',false],['priceCny','Current RMB product price','text',true],['moq','MOQ','number',true],['domesticFreight','China domestic freight (RMB)','text',true],['leadTimeDays','Lead time (days)','number',true]]){const f=labeled(label,type,required);fields[key]=f.input;verified.append(f.wrap);}const internal=textarea('Internal verification note');verified.append(internal.wrap);
      const save=node('button','Save verification','btn');save.type='button';save.addEventListener('click',()=>{try{if(!Object.values(fields).every(f=>f.checkValidity())){show('Complete the required verification fields.');return;}
        mutate(`/api/operator/requests/${request.id}/review`,{action:'VERIFY',expectedVersion:request.version,verifiedTitle:fields.verifiedTitle.value,supplierName:fields.supplierName.value,supplierUrl:fields.supplierUrl.value,
          priceCnyFen:parseMinor(fields.priceCny.value),moq:Number(fields.moq.value),domesticFreightCnyFen:parseMinor(fields.domesticFreight.value),leadTimeDays:Number(fields.leadTimeDays.value),internalNotes:internal.input.value});}catch(err){show(err.message);}});verified.append(save);box.append(verified);
    }
    if(['VERIFIED','QUOTED'].includes(request.status))box.append(quoteBuilder(request));
    const history=node('section',undefined,'ops-panel');history.append(node('h3','Event history'));const list=node('ol');for(const event of data.events){const item=node('li');item.append(node('strong',`${new Date(event.created_at).toLocaleString('en-GB')} · ${event.type} · ${event.actor_type}`));if(event.public_message)item.append(node('p',event.public_message));if(event.internal_message)item.append(node('p','Internal: '+event.internal_message));list.append(item);}history.append(list);box.append(history);
    if(data.quotes.length){const section=node('section',undefined,'ops-panel');section.append(node('h3','Immutable quote versions'));for(const q of data.quotes){const article=node('article',undefined,'quote-version');article.append(node('h4',`Version ${q.version} · ${money(q.total_minor,q.currency)} · valid until ${q.valid_until}`));for(const item of q.items)line(article,item.category,money(item.amount_minor,q.currency)+' — '+item.description);if(q.operator_notes)line(article,'Internal quote note',q.operator_notes);section.append(article);}box.append(section);}
    app.append(box);
  }
  function quoteBuilder(request){const box=node('section',undefined,'ops-panel');box.append(node('h3',M.quote));
    const currency=labeled('Customer quote currency','text',true),validUntil=labeled('Valid until (YYYY-MM-DD)','date',true);
    currency.input.placeholder='CNY, USD, EUR, GBP or INR';box.append(currency.wrap,validUntil.wrap);
    const customerNotes=textarea('Customer-facing quote notes'),operatorNotes=textarea('Internal operator notes');box.append(customerNotes.wrap,operatorNotes.wrap);
    const rows=node('div');box.append(rows);
    function addRow(category='GOODS'){
      const row=node('div',undefined,'quote-entry');const select=node('select');for(const value of ['GOODS','CHINA_FREIGHT','SERVICE','QC','WAREHOUSE','INTERNATIONAL_FREIGHT','OTHER']){const option=node('option',value.replaceAll('_',' '));option.value=value;select.append(option);}select.value=category;
      const description=node('input');description.placeholder='Line description';description.maxLength=300;
      const amount=node('input');amount.placeholder='Amount (e.g. 125.00)';amount.inputMode='decimal';
      const remove=node('button','Remove','btn secondary');remove.type='button';remove.addEventListener('click',()=>row.remove());row.append(select,description,amount,remove);rows.append(row);
      return {row,select,description,amount};
    }
    addRow();const add=node('button','Add quote line','btn secondary');add.type='button';add.addEventListener('click',()=>addRow('OTHER'));box.append(add);
    const publish=node('button','Publish immutable quote version','btn');publish.type='button';publish.addEventListener('click',()=>{try{const items=[...rows.children].map(row=>({category:row.children[0].value,description:row.children[1].value,amountMinor:parseMinor(row.children[2].value)}));
      if(!items.length)throw Error('Add at least one quote line.');
      mutate(`/api/operator/requests/${request.id}/quotes`,{expectedVersion:request.version,currency:currency.input.value,validUntil:validUntil.input.value,customerNotes:customerNotes.input.value,operatorNotes:operatorNotes.input.value,items});}catch(err){show(err.message);}});box.append(publish);return box;
  }
  async function open(ref){try{show('Loading '+ref+'…');detail(await api('/api/operator/requests/'+ref));show('Request loaded.');}catch(err){show(err.message);}}
  async function loadList(){try{const filter=app.querySelector('#ops-filter')?.value||'';const data=await api('/api/operator/requests'+(filter?'?status='+encodeURIComponent(filter):''));const list=app.querySelector('#ops-list');list.replaceChildren();for(const r of data.requests){const button=node('button',`${r.id} · ${r.status} · ${r.name}${r.company?' / '+r.company:''}`,'ops-list-item');button.type='button';button.addEventListener('click',()=>open(r.id));list.append(button);}if(!data.requests.length)list.append(node('p','No requests in this view.'));}catch(err){show(err.message);}}
  async function loadNotifications(){try{const data=await api('/api/operator/notifications');const list=app.querySelector('#ops-notifications');list.replaceChildren();for(const n of data.notifications){const p=node('p',`${new Date(n.created_at).toLocaleString('en-GB')} · ${n.type} · ${n.recipient_role} · ${n.request_id} · ${n.status}`);list.append(p);}if(!data.notifications.length)list.append(node('p','No notification records.'));}catch(err){show(err.message);}}
  async function loadLegacy(){try{const data=await api('/api/operator/legacy-enquiries');const list=app.querySelector('#ops-legacy');list.replaceChildren();for(const row of data.enquiries){let payload;try{payload=JSON.parse(row.payload);}catch{payload={};}const item=node('details');item.append(node('summary',`${row.id} · ${row.kind} · ${new Date(row.created_at).toLocaleString('en-GB')}`));for(const [key,value] of Object.entries(payload))if(key!=='idempotencyKey')line(item,key,value);list.append(item);}if(!data.enquiries.length)list.append(node('p','No earlier enquiries.'));}catch(err){show(err.message);}}
  function showApp(){app.replaceChildren();app.hidden=false;const controls=node('div',undefined,'ops-toolbar');const filter=node('select');filter.id='ops-filter';for(const value of ['', 'SUBMITTED','UNDER_REVIEW','NEEDS_INFORMATION','VERIFIED','QUOTED','CUSTOMER_APPROVED','CUSTOMER_DECLINED']){const option=node('option',value||'All statuses');option.value=value;filter.append(option);}filter.addEventListener('change',loadList);controls.append(filter);const refresh=node('button','Refresh','btn secondary');refresh.type='button';refresh.addEventListener('click',()=>{loadList();loadNotifications();});controls.append(refresh);const logout=node('button','Clear credential','btn secondary');logout.type='button';logout.addEventListener('click',()=>{token='';selected=null;app.hidden=true;auth.hidden=false;show('Credential cleared from this page.');});controls.append(logout);app.append(controls);
    const queue=node('section',undefined,'ops-panel');queue.append(node('h2',M.queue));const list=node('div');list.id='ops-list';queue.append(list);app.append(queue);
    const notifications=node('section',undefined,'ops-panel');notifications.append(node('h2',M.notifications),node('p',M.noDelivery));const nlist=node('div');nlist.id='ops-notifications';notifications.append(nlist);app.append(notifications);
    const legacy=node('section',undefined,'ops-panel');legacy.append(node('h2',M.legacy));const llist=node('div');llist.id='ops-legacy';legacy.append(llist);const legacyButton=node('button','Load earlier enquiries','btn secondary');legacyButton.type='button';legacyButton.addEventListener('click',loadLegacy);legacy.append(legacyButton);app.append(legacy);
  }
  auth.addEventListener('submit',async event=>{event.preventDefault();token=document.querySelector('#ops-token').value;try{await api('/api/operator/requests');document.querySelector('#ops-token').value='';auth.hidden=true;showApp();await loadList();await loadNotifications();show('Operator queue open.');}catch(err){token='';show(err.message);}});
})();
