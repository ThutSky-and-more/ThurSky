(() => {
  const landing=document.querySelector('[data-account-landing]');
  const dashboard=document.querySelector('[data-account-dashboard]');
  const continueBtn=document.querySelector('[data-account-continue]');
  const ordersRoot=document.querySelector('[data-customer-orders]');
  const message=document.querySelector('[data-account-message]');
  if(!landing||!dashboard)return;
  const user=()=>window.ThurSkyAuth?.currentUser();
  const showLanding=()=>{landing.classList.remove('hidden');dashboard.classList.add('hidden');const u=user();document.querySelector('[data-already-user]')?.classList.toggle('hidden',!u);};
  const statusLabels={received:'Anfrage eingegangen',planning:'Termin wird geplant',confirmed:'Termin bestätigt',captured:'Aufnahmen erstellt',editing:'In Bearbeitung',ready:'Bereit zum Download',completed:'Abgeschlossen',cancelled:'Storniert'};
  const esc=ThurSkyContent.escape;
  async function loadDashboard(){
    const u=user();if(!u){window.ThurSkyAuth?.openLogin();return;}
    landing.classList.add('hidden');dashboard.classList.remove('hidden');
    document.querySelector('[data-customer-email]').textContent=u.email;
    ordersRoot.innerHTML='<p>Bestellungen werden geladen …</p>';
    try{
      const data=await ThurSkyApi.request('/.netlify/functions/orders');
      const orders=data.orders||[];
      ordersRoot.innerHTML=orders.length?orders.map(o=>`<article class="order-card"><div class="order-head"><div><h2>${esc(o.order_number)}</h2><div class="muted">${new Date(o.created_at).toLocaleDateString('de-CH')} · ${esc(o.package_name)}</div></div><span class="status">${esc(statusLabels[o.status]||o.status)}</span></div>${o.admin_message?`<p><strong>Nachricht:</strong> ${esc(o.admin_message)}</p>`:''}<div class="file-list">${(o.files||[]).map(f=>`<button class="btn btn-primary" data-download-file="${esc(f.id)}">${esc(f.original_name)}</button>`).join('')||'<span class="muted">Noch keine Dateien freigegeben.</span>'}</div></article>`).join(''):'<div class="box"><h2>Noch keine Bestellungen</h2><p>Über „Bestellen“ kannst du deine erste Anfrage senden.</p><a class="btn btn-primary" href="/bestellen/">Anfrage erstellen</a></div>';
    }catch(err){ordersRoot.innerHTML=`<div class="notice error">${esc(err.message)}</div>`;}
  }
  continueBtn?.addEventListener('click',loadDashboard);
  document.querySelector('[data-account-back]')?.addEventListener('click',showLanding);
  ordersRoot?.addEventListener('click',async e=>{
    const btn=e.target.closest('[data-download-file]');if(!btn)return;
    try{btn.disabled=true;const data=await ThurSkyApi.request(`/.netlify/functions/file-download?id=${encodeURIComponent(btn.dataset.downloadFile)}`);location.href=data.url;}catch(err){message.className='notice error';message.textContent=err.message;}finally{btn.disabled=false;}
  });
  window.addEventListener('thursky:login',()=>showLanding());window.addEventListener('thursky:logout',showLanding);showLanding();
})();
