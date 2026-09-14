(() => {
  const menu = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.navlinks');
  menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.querySelectorAll('details[open]').forEach(d => d.open = false); if (nav.classList.contains('open')) { nav.classList.remove('open'); menu.setAttribute('aria-expanded','false'); menu.focus(); } } });
  document.addEventListener('click', e => document.querySelectorAll('.navlinks details[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
  document.querySelectorAll('.navlinks a').forEach(a => { if (a.pathname === location.pathname) a.setAttribute('aria-current','page'); });
  const query = new URLSearchParams(location.search);
  const product = document.querySelector('[name=productUrl]');
  if (product && query.has('productUrl')) product.value = query.get('productUrl').slice(0,2048);
  const service = document.querySelector('[name=service]');
  if (service && query.has('service')) { const option = [...service.options].find(o => o.value.toLowerCase().includes(query.get('service').split(' ')[0].toLowerCase())); if (option) service.value = option.value; }
  const container = document.querySelector('[data-contact-dest]');
  if (container) fetch('/api/config').then(r=>r.ok?r.json():{}).then(config=>{
    if(config.contactEmail){const a=document.createElement('a');a.href='mailto:'+config.contactEmail;a.textContent=config.contactEmail;container.append(a);}
    if(config.whatsappNumber){const a=document.createElement('a');a.href='https://wa.me/'+config.whatsappNumber.replace(/\D/g,'');a.textContent='WhatsApp '+config.whatsappNumber;a.target='_blank';a.rel='noopener';container.append(a);}
  }).catch(()=>{});
  document.querySelectorAll('.request-form').forEach(form => {
    let requestKey = crypto.randomUUID();
    let previousPayload = null;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const status = form.querySelector('.status');
      const button = form.querySelector('[type=submit]');
      const original = button.textContent;
      const data = Object.fromEntries(new FormData(form));
      data.kind = form.dataset.kind;
      data.consent = data.consent === 'on';
      function fail(message) {status.className='status error';status.textContent=message;status.focus();}
      if (!data.email.trim() && !data.whatsapp.trim()) return fail('Please provide an email address or a WhatsApp number so FRJD can respond.');
      if (data.whatsapp && !/^\+?[\d\s().-]{7,32}$/.test(data.whatsapp)) return fail('Please enter a valid WhatsApp number with its country code.');
      if (data.kind==='quote' && !data.productUrl.trim() && !data.productName.trim()) return fail('Please add a product link or describe the product you want to source.');
      if (data.productUrl) {try {const u = new URL(data.productUrl);if(!['https:','http:'].includes(u.protocol)||u.username||u.password) throw Error();}catch{return fail('Please enter a full http or https product URL, without login credentials.');}}
      const signature=JSON.stringify(data);
      if(previousPayload!==null&&signature!==previousPayload)requestKey=crypto.randomUUID();
      previousPayload=signature;
      data.idempotencyKey=requestKey;
      button.disabled=true;button.textContent='Saving your request…';status.className='status';status.textContent='Please wait while your request is saved.';
      try {
        const response = await fetch('/api/submit-quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});
        let result;try {result=await response.json();}catch{throw Error('We could not confirm that your request was saved. Please retry; your entries are still here.');}
        if(!response.ok||!result.success||!result.request_id)throw Error(result.error||'Your request could not be saved. Please retry; your entries are still here.');
        status.className='status success';status.replaceChildren();
        const h=document.createElement('h3');h.textContent='Your request is saved.';
        const ref=document.createElement('p');ref.className='reference';ref.textContent=result.request_id;
        const note=document.createElement('p');note.textContent='Keep this reference. FRJD will use the contact details you provided to follow up. This confirmation is not an order or a price quotation.';
        const copy=document.createElement('button');copy.type='button';copy.className='btn secondary';copy.textContent='Copy reference';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(result.request_id);copy.textContent='Reference copied';}catch{copy.textContent='Select and copy the reference above';}});
        const next=document.createElement('button');next.type='button';next.className='btn secondary';next.textContent='Start another request';next.addEventListener('click',()=>{form.reset();requestKey=crypto.randomUUID();previousPayload=null;status.replaceChildren();button.disabled=false;button.textContent=original;form.querySelector('input:not([name=website])').focus();});
        const actions=document.createElement('div');actions.className='actions';actions.append(copy,next);status.append(h,ref,note,actions);button.textContent='Request saved';status.focus();
      } catch (err) {fail(err.name==='TimeoutError'?'We could not confirm the save in time. Please retry with the same entries; duplicate submissions are prevented.':err.message);button.disabled=false;button.textContent=original;}
    });
  });
})();
