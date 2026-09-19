(() => {
  // New application strings are keyed so a later English/Chinese catalog can
  // replace this object without changing persisted state codes.
  const M={missing:'This private request link is incomplete. Use the full link you saved after submission.',loading:'Opening your request…',
    private:'Keep this link private. It grants access to your request and quote.',noQuote:'FRJD has not published a quote yet.',
    question:'Ask a question',approve:'Approve this quote',decline:'Decline this quote',answer:'Send information',
    noDelivery:'A message is recorded in the request history. No email or WhatsApp delivery is claimed. Approval records your decision; it does not place an order, take payment or trigger purchasing.'};
  const box=document.querySelector('#request-view'),status=document.querySelector('#request-status');
  const values=new URLSearchParams(location.hash.slice(1));const ref=values.get('ref')||'',token=values.get('access')||'';
  const apiOrigin=document.querySelector('meta[name="frjd-api-origin"]')?.content||'';
  const node=(tag,value,className)=>{const element=document.createElement(tag);if(value!==undefined)element.textContent=String(value);if(className)element.className=className;return element;};
  const line=(parent,label,value)=>{const p=node('p');p.append(node('strong',label+': '),document.createTextNode(String(value??'—')));parent.append(p);};
  const money=(minor,currency)=>new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(minor/100);
  const date=value=>new Date(value).toLocaleString('en-GB');
  const error=message=>{status.className='notice status error';status.textContent=message;status.hidden=false;};
  if(!/^FRJD-PR-[A-F0-9]{12}$/.test(ref)||!/^[a-f0-9]{64}$/.test(token)){error(M.missing);return;}
  async function call(path,options={}){
    const response=await fetch(apiOrigin+path,{...options,headers:{'Authorization':'Bearer '+token,...options.headers},signal:AbortSignal.timeout(20000)});
    const body=await response.json();if(!response.ok)throw Error(body.error||'The request could not be loaded.');return body;
  }
  async function act(action,version,quoteVersion,message=''){
    try{status.hidden=false;status.textContent='Recording your action…';
      await call('/api/procurement-requests/'+ref+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,expectedVersion:version,quoteVersion,message})});
      await load();
    }catch(err){error(err.message);}
  }
  function render(data){
    box.replaceChildren();box.hidden=false;status.hidden=true;
    const request=data.request;
    const summary=node('section',undefined,'request-card');summary.append(node('h2',request.ref),node('p',M.private));
    line(summary,'Status',request.status.replaceAll('_',' '));line(summary,'Submitted',date(request.submitted_at));
    line(summary,'Destination',request.destination_country+(request.postal_code?' · '+request.postal_code:''));
    line(summary,'QC requirement',request.qc_requirement);if(request.requested_service)line(summary,'Service requested',request.requested_service);
    if(request.target_price)line(summary,'Target price',request.target_price);if(request.notes)line(summary,'Your notes',request.notes);
    box.append(summary);
    const requirements=node('section',undefined,'request-card');requirements.append(node('h2','Requested product'));
    for(const item of data.items){line(requirements,'Description',item.description);line(requirements,'Quantity',item.quantity);if(item.variant_specification)line(requirements,'Variant / specification',item.variant_specification);}
    for(const source of data.sources){const p=node('p');p.append(node('strong','Product link ('+source.platform+'): '));const a=node('a',source.url);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);requirements.append(p);}
    for(const verified of data.verified){line(requirements,'Verified product',verified.verified_title);line(requirements,'Supplier',verified.supplier_name);line(requirements,'MOQ',verified.moq);line(requirements,'Lead time',verified.lead_time_days+' days');}
    box.append(requirements);
    const quoteCard=node('section',undefined,'request-card');quoteCard.append(node('h2','Commercial quote'));
    if(!data.quotes.length)quoteCard.append(node('p',M.noQuote));
    for(const quote of data.quotes){const article=node('article',undefined,'quote-version');article.append(node('h3','Quote version '+quote.version+(quote.version===request.current_quote_version?' · current':'')));
      line(article,'Published',date(quote.published_at));line(article,'Valid until',quote.valid_until);
      const table=node('table');const head=node('tr');for(const label of ['Category','Description','Amount'])head.append(node('th',label));table.append(head);
      for(const item of quote.items){const row=node('tr');row.append(node('td',item.category.replaceAll('_',' ')),node('td',item.description),node('td',money(item.amount_minor,quote.currency)));table.append(row);}
      const total=node('tr');total.append(node('th','Total'),node('td',''),node('th',money(quote.total_minor,quote.currency)));table.append(total);article.append(table);
      if(quote.customer_notes)line(article,'Quote notes',quote.customer_notes);
      if(quote.version===request.current_quote_version&&request.status==='QUOTED'){
        const actions=node('div',undefined,'customer-actions');const input=node('textarea');input.maxLength=3000;input.placeholder='Question or reason for decline (optional for decline)';input.setAttribute('aria-label','Question or reason');actions.append(input);
        const buttons=node('div',undefined,'actions');for(const [label,action] of [[M.approve,'APPROVE'],[M.question,'QUESTION'],[M.decline,'DECLINE']]){const button=node('button',label,'btn'+(action==='APPROVE'?'':' secondary'));button.type='button';button.addEventListener('click',()=>{if(action==='QUESTION'&&!input.value.trim()){error('Enter your question before sending.');return;}act(action,request.version,quote.version,input.value);});buttons.append(button);}actions.append(buttons,node('p',M.noDelivery));article.append(actions);
      }
      quoteCard.append(article);
    }
    box.append(quoteCard);
    if(request.status==='NEEDS_INFORMATION'){const section=node('section',undefined,'request-card');section.append(node('h2','FRJD needs more information'));const input=node('textarea');input.maxLength=3000;input.setAttribute('aria-label','Additional information');section.append(input);const button=node('button',M.answer,'btn');button.type='button';button.addEventListener('click',()=>{if(!input.value.trim()){error('Enter the requested information.');return;}act('PROVIDE_INFORMATION',request.version,null,input.value);});section.append(button);box.append(section);}
    const history=node('section',undefined,'request-card');history.append(node('h2','Request history'));const list=node('ol');for(const event of data.events){const item=node('li');item.append(node('strong',date(event.created_at)+' · '+event.type.replaceAll('_',' ')),node('p',event.message));list.append(item);}history.append(list);box.append(history);
  }
  async function load(){try{status.hidden=false;status.className='notice';status.textContent=M.loading;render(await call('/api/procurement-requests/'+ref));}catch(err){error(err.message);}}
  load();
})();
