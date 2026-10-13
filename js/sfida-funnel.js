(() => {
  'use strict';
  const preview=window.SfidaPreview;
  if (!preview) return;
  const page=document.body.dataset.page;
  let lastReceipt=null;
  function dialog(title,message) {
    let panel=document.getElementById('sfida-review-dialog');
    if (!panel) {
      panel=document.createElement('dialog');panel.id='sfida-review-dialog';panel.className='sfida-review-dialog';panel.dataset.previewUi='';
      panel.innerHTML='<h2></h2><p></p><div class="sfida-preview-dialog-links"><a href="/sfida-funnel">Mappa del funnel</a><a href="/sfida-7-giorni">Landing</a><a href="/sfida-checkout">Carrello</a></div><pre hidden></pre><button type="button">Chiudi</button>';
      panel.querySelector('button').addEventListener('click',()=>panel.close());document.body.append(panel);
    }
    panel.querySelector('h2').textContent=title;panel.querySelector('p').textContent=message;
    panel.querySelector('pre').hidden=!lastReceipt;
    if(lastReceipt)panel.querySelector('pre').textContent=JSON.stringify(lastReceipt,null,2);
    if(!panel.open)panel.showModal();
  }
  document.querySelector('[data-preview-help]')?.addEventListener('click',()=>dialog('Anteprima del funnel','Queste pagine riproducono il funnel originale. Il pagamento è simulato: nessun addebito, nessun invio email, nessun accesso all’app attivato. I collegamenti agli store conservano le destinazioni originali, da verificare prima del lancio.'));
  document.querySelectorAll('[data-preview-external-form]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();dialog('Collegamento originale da verificare','Il pulsante originale punta a un URL del modulo duplicato e malformato. La copia mantiene il testo; nell’anteprima non vengono inviati dati al modulo esterno.');}));
  const campaignKeys=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','campaign_id','adset_id','ad_id'];
  const campaign=new URLSearchParams();const current=new URLSearchParams(location.search);
  campaignKeys.forEach(key=>{const value=current.get(key);if(value&&!/[@<>]|https?:/i.test(value))campaign.set(key,value.slice(0,100));});
  function destination(path){return path+(campaign.size?(path.includes('?')?'&':'?')+campaign:'');}
  document.querySelectorAll('a[href^="/sfida-"]').forEach(link=>{if(campaign.size&&!link.hash)link.href=destination(link.getAttribute('href'));});
  document.querySelectorAll('[data-preview-go]').forEach(button=>button.addEventListener('click',event=>{
    event.preventDefault();const target=button.dataset.previewGo;
    if(target.startsWith('#'))document.getElementById(target.slice(1))?.scrollIntoView({behavior:'smooth'});
    else location.assign(destination(target));
  }));
  document.querySelectorAll('.hl-faq-child').forEach(item=>{
    const head=item.querySelector('.hl-faq-child-heading'),panel=item.querySelector('.hl-faq-child-panel');
    if(!head||!panel)return;
    head.tabIndex=0;head.setAttribute('role','button');head.setAttribute('aria-expanded','false');
    function toggle(){const open=head.getAttribute('aria-expanded')!=='true';head.setAttribute('aria-expanded',String(open));panel.style.display=open?'block':'none';panel.style.height=open?'auto':'0px';panel.style.maxHeight=open?'none':'0px';}
    head.addEventListener('click',toggle);head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});
  });
  document.querySelectorAll('[data-preview-video]').forEach(container=>{
    const source=container.dataset.previewVideo;
    container.tabIndex=0;container.setAttribute('role','group');container.setAttribute('aria-label','Video testimonianza, premi Invio per riprodurre');
    function play(){
      let video=container.querySelector('.sfida-native-video');
      if(!video){
        container.classList.add('sfida-video-container');video=document.createElement('video');video.className='sfida-native-video';video.controls=true;video.playsInline=true;video.preload='none';video.src=source;video.poster=container.dataset.previewPoster||'';container.append(video);
        video.addEventListener('click',event=>event.stopPropagation());
      }
      video.play().catch(()=>{});
    }
    container.addEventListener('click',play);container.addEventListener('keydown',e=>{if(e.target===container&&(e.key==='Enter'||e.key===' ')){e.preventDefault();play();}});
  });
  // Original background videos and their separate sound controls.
  document.querySelectorAll('button').forEach(button=>{
    if(/^(Enable sound|Abilita suono)$/.test(button.textContent.trim()))button.addEventListener('click',()=>{
      const section=button.closest('.c-section,.c-row')||button.parentElement;const video=section.querySelector('video');
      if(video){video.muted=!video.muted;button.textContent=video.muted?'Abilita suono':'Disattiva suono';}
    });
  });
  document.querySelectorAll('[data-preview-popup]').forEach(button=>button.addEventListener('click',()=>{
    const template=document.getElementById('sfida-popup-template');
    if(template){
      let popup=document.getElementById('sfida-legacy-popup');
      if(!popup){
        popup=document.createElement('div');popup.id='sfida-legacy-popup';popup.innerHTML=template.innerHTML;document.body.append(popup);
        const overlay=popup.querySelector('#overlay'),body=popup.querySelector('.popup-body');
        overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Pagamento, anteprima del popup originale');
        const close=popup.querySelector('.closeLPModal');
        function hide(){popup.hidden=true;document.body.style.overflow='';const root=document.querySelector('#__nuxt');if(root)root.inert=false;button.focus();}
        close?.addEventListener('click',hide);if(close){close.tabIndex=0;close.setAttribute('role','button');close.setAttribute('aria-label','Chiudi popup');close.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();hide();}});}
        overlay.addEventListener('click',e=>{if(e.target===overlay)hide();});
        overlay.addEventListener('keydown',e=>{if(e.key==='Escape')hide();if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll('a[href],button:not([disabled]),[tabindex="0"]')].filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
        const notice=document.createElement('div');notice.className='sfida-test-payment';notice.dataset.previewUi='';notice.innerHTML='<p class="sfida-test-info">Anteprima del popup originale. Per effettuare una prova senza addebiti usa il checkout simulato.</p><a class="sfida-preview-action" href="/sfida-checkout">Continua con la prova</a>';body.append(notice);
      }
      popup.hidden=false;const root=document.querySelector('#__nuxt');if(root)root.inert=true;document.body.style.overflow='hidden';popup.querySelector('.closeLPModal')?.focus();
    } else location.assign(destination('/sfida-checkout'));
  }));
  const form=document.querySelector('[data-funnel-checkout]');
  if(form){
    let customer=null,ticket=null,requestId=null,busy=false,ticketFingerprint=null;
    const stepOne=form.innerHTML;
    function bindStepOne(){form.querySelector('[data-preview-next]').addEventListener('click',()=>{
      const fields=['name','email','phone'].map(name=>form.querySelector('input[name="'+name+'"]'));
      for(const input of fields){if(!input.value.trim()||!input.reportValidity()){input.reportValidity();input.focus();return;}}
      customer={name:fields[0].value.trim(),email:fields[1].value.trim()};requestId=crypto.randomUUID();ticket=null;showStepTwo();
    });}
    function showStepTwo(){
      const template=document.getElementById('sfida-native-step2');
      if(template)form.innerHTML=template.content.querySelector('.container-order-form-two-step').innerHTML;
      const body=form.querySelector('.form-body');
      body.innerHTML='<div class="sfida-test-payment"><div class="sfida-test-info">Modalità di prova. Nessun addebito, nessuna email o attivazione. Non inserire dati di carte reali.</div><div class="sfida-test-row"><span>Il Primo Passo · Sfida 7 giorni</span><strong>37,00 €</strong></div><label class="sfida-test-label" for="sfida-demo-card">Carta di prova (simulata)</label><input class="sfida-test-card" id="sfida-demo-card" disabled value="4242 4242 4242 4242"><label class="sfida-test-check"><input type="checkbox" id="sfida-test-ack"><span>Confermo che sto effettuando una prova senza addebiti.</span></label><label class="sfida-test-check"><input type="checkbox" id="sfida-test-consent"><span>Consento la registrazione locale degli eventi e della provenienza per questa prova. Nessun dato viene inviato a Meta.</span></label><p class="sfida-test-error" role="alert" hidden></p><button type="button" class="form-btn" data-pay="success"><span class="main-text">Completa ordine</span><br><span class="sub-text">Acquisto di prova</span></button><button type="button" class="sfida-test-secondary" data-pay="declined">Simula pagamento rifiutato</button><button type="button" class="sfida-test-secondary" data-back>Torna ai dati</button></div>';
      const headings=form.querySelectorAll('.form-heading');headings.forEach((h,i)=>h.classList.toggle('active',i===1));
      form.querySelector('.divider-form')?.classList.add('step2');
      body.querySelector('[data-back]').addEventListener('click',()=>{form.innerHTML=stepOne;form.querySelector('[name=name]').value=customer.name;form.querySelector('[name=email]').value=customer.email;bindStepOne();});
      body.querySelectorAll('[data-pay]').forEach(button=>button.addEventListener('click',()=>pay(button.dataset.pay)));
      body.querySelector('#sfida-test-ack').focus();
    }
    async function pay(outcome){
      if(busy)return;const error=form.querySelector('.sfida-test-error');error.hidden=true;
      if(!form.querySelector('#sfida-test-ack').checked){error.textContent='Conferma che si tratta di una prova.';error.hidden=false;return;}
      if(!preview.write('storage-test',true)){error.textContent='Abilita l’archivio di sessione del browser per continuare.';error.hidden=false;return;}
      busy=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);
      try{
        const consent=form.querySelector('#sfida-test-consent').checked;
        const attribution=await preview.prepare(consent);
        const nextFingerprint=JSON.stringify(attribution);
        if(ticketFingerprint!==nextFingerprint){ticket=null;requestId=crypto.randomUUID();ticketFingerprint=nextFingerprint;}
        if(!ticket){const created=await preview.api('create',{...customer,...attribution,terms:true,requestId});ticket=created.ticket;preview.write('receipt',null);if(!preview.write('ticket',ticket))throw new Error('Impossibile salvare la sessione di prova.');if(created.url){location.assign(created.url);return;}}
        const paid=await preview.api('complete',{ticket,outcome});
        if(!preview.write('receipt',paid.receipt))throw new Error('Impossibile salvare la conferma di prova.');
        location.assign('/sfida-esito');
      }catch(e){error.textContent=e.message;error.hidden=false;}
      finally{busy=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
    }
    bindStepOne();
  }
  if(page==='funnel-receipt'){
    const badge=document.querySelector('[data-preview-help]');
    if(!preview.read('receipt')&&!preview.read('ticket')){badge.textContent='Anteprima grafica · nessun ordine verificato';return;}
    preview.api('receipt',{receipt:preview.read('receipt'),ticket:preview.read('ticket')}).then(result=>{
      lastReceipt=result;badge.textContent='Ordine di prova verificato · nessun addebito';badge.dataset.verified='true';
      if(result.tracking)preview.record('Purchase',result.tracking.browser.eventID,{value:37,currency:'EUR',order_id:result.orderId});
    }).catch(()=>{badge.textContent='Anteprima grafica · ordine non verificato';});
  }
})();
