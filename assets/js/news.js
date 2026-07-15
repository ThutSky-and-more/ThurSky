(async()=>{
  const root=document.querySelector('[data-news-grid]');if(!root)return;
  const data=await ThurSkyContent.load('/content/news.json',{posts:[]});
  const posts=(data.posts||[]).filter(p=>p.published!==false).sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(!posts.length){root.innerHTML='<div class="box"><h2>Noch keine News</h2><p>Neue Beiträge können im CMS erstellt werden.</p></div>';return;}
  root.innerHTML=posts.map(p=>`<article class="news-card">${p.image?`<img src="${ThurSkyContent.escape(p.image)}" alt="${ThurSkyContent.escape(p.title||'News')}">`:''}<div class="news-card-body"><div class="news-date">${new Date(p.date).toLocaleDateString('de-CH')}</div><h2>${ThurSkyContent.escape(p.title)}</h2><p>${ThurSkyContent.escape(p.description||'')}</p><div>${String(p.body||'').replace(/\n/g,'<br>')}</div></div></article>`).join('');
})();
