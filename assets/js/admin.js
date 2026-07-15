(() => {
  const gate=document.querySelector('[data-admin-gate]');
  const app=document.querySelector('[data-admin-app]');
  const ordersRoot=document.querySelector('[data-admin-orders]');
  const statsRoot=document.querySelector('[data-admin-stats]');
  const notice=document.querySelector('[data-admin-notice]');
  if(!gate||!app)return;
  const labels={received:'Anfrage eingegangen',planning:'Termin wird geplant',confirmed:'Termin bestätigt',captured:'Aufnahmen erstellt',editing:'In Bearbeitung',ready:'Bereit zum Download',completed:'Abgeschlossen',cancelled:'Storniert'};
  const statuses=Object.entries(labels);
  const esc=ThurSkyContent.escape;
  const isAdmin=u=>(u?.app_metadata?.roles||[]).includes('admin');
  async function load(){
    const user=window.ThurSkyAuth?.currentUser();
    if(!isAdmin(user)){gate.classList.remove('hidden');app.classList.add('hidden');return;}
    gate.classList.add('hidden');app.classList.remove('hidden');ordersRoot.innerHTML='<p>Bestellungen werden geladen …</p>';
    try{
      const data=await ThurSkyApi.request('/.netlify/functions/orders?scope=all');const orders=data.orders||[];
      const counts={all:orders.length,open:orders.filter(o=>!['completed','cancelled'].includes(o.status)).length,ready:orders.filter(o=>o.status==='ready').length,done:orders.filter(o=>o.status==='completed').length};
      statsRoot.innerHTML=`<div class="admin-stat"><span>Gesamt</span><strong>${counts.all}</strong></div><div class="admin-stat"><span>Offen</span><strong>${counts.open}</strong></div><div class="admin-stat"><span>Bereit</span><strong>${counts.ready}</strong></div><div class="admin-stat"><span>Abgeschlossen</span><strong>${counts.done}</strong></div>`;
      ordersRoot.innerHTML=orders.length?orders.map(o=>`<article class="admin-order" data-order-id="${esc(o.id)}"><div class="order-head"><div><h2>${esc(o.order_number)}</h2><div class="muted">${esc(o.customer_email)} · ${new Date(o.created_at).toLocaleString('de-CH')}</div></div><span class="status">${esc(labels[o.status]||o.status)}</span></div><p><strong>Leistung:</strong> ${esc(o.package_name)}</p><p><strong>Adresse:</strong> ${esc([o.street,o.postal_code,o.city].filter(Boolean).join(', '))}</p>${o.customer_message?`<p><strong>Kundennachricht:</strong> ${esc(o.customer_message)}</p>`:''}<div class="admin-actions"><div class="field"><label>Status</label><select data-status>${statuses.map(([v,l])=>`<option value="${v}" ${v===o.status?'selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label>Nachricht an Kunde</label><textarea data-admin-message>${esc(o.admin_message||'')}</textarea></div><div class="field"><label>Datei freigeben</label><input type="file" data-file><button class="btn btn-accent" type="button" data-upload>Hochladen</button></div></div><div class="btn-row"><button class="btn btn-primary" type="button" data-save>Änderungen speichern</button></div><div class="file-list">${(o.files||[]).map(f=>`<span class="status">${esc(f.original_name)}</span>`).join('')}</div></article>`).join(''):'<div class="box"><h2>Noch keine Bestellungen</h2></div>';
    }catch(err){ordersRoot.innerHTML=`<div class="notice error">${esc(err.message)}</div>`;}
  }
  async function save(card){
    const id=card.dataset.orderId;const status=card.querySelector('[data-status]').value;const admin_message=card.querySelector('[data-admin-message]').value;
    await ThurSkyApi.request('/.netlify/functions/orders',{method:'PATCH',body:JSON.stringify({id,status,admin_message})});
  }
  async function upload(card){
    const file=card.querySelector('[data-file]').files[0];if(!file)throw new Error('Bitte zuerst eine Datei auswählen.');
    const order_id=card.dataset.orderId;
    const prep=await ThurSkyApi.request('/.netlify/functions/file-upload-url',{method:'POST',body:JSON.stringify({order_id,filename:file.name,mime_type:file.type,size_bytes:file.size})});
    const r=await fetch(prep.signed_url,{method:'PUT',headers:{'content-type':file.type||'application/octet-stream'},body:file});if(!r.ok)throw new Error('Upload zu Supabase fehlgeschlagen.');
    await ThurSkyApi.request('/.netlify/functions/file-complete',{method:'POST',body:JSON.stringify({order_id,path:prep.path,original_name:file.name,mime_type:file.type,size_bytes:file.size})});
  }
  ordersRoot?.addEventListener('click',async e=>{
    const card=e.target.closest('[data-order-id]');if(!card)return;
    try{
      if(e.target.closest('[data-save]')){e.target.disabled=true;await save(card);notice.className='notice success';notice.textContent='Bestellung gespeichert.';await load();}
      if(e.target.closest('[data-upload]')){e.target.disabled=true;await upload(card);notice.className='notice success';notice.textContent='Datei hochgeladen und freigegeben.';await load();}
    }catch(err){notice.className='notice error';notice.textContent=err.message;}finally{e.target.disabled=false;}
  });
  window.addEventListener('thursky:login',load);window.addEventListener('thursky:logout',load);setTimeout(load,100);
})();
