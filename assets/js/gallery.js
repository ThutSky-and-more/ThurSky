(async () => {
  const grid = document.querySelector('[data-gallery-grid]'); if (!grid) return;
  const fallback = {images:[]};
  const data = await ThurSkyContent.load('/content/gallery.json', fallback);
  const images = Array.isArray(data.images) ? data.images.filter(x=>x?.image) : [];
  if (!images.length) { grid.innerHTML='<div class="box"><h2>Noch keine Galerie-Bilder</h2><p>Im CMS unter „Galerie“ können Bilder hochgeladen werden.</p></div>'; return; }
  grid.innerHTML = images.map((x,i)=>`<article class="gallery-item" data-gallery-index="${i}" tabindex="0"><img src="${ThurSkyContent.escape(x.image)}" alt="${ThurSkyContent.escape(x.alt||x.title||'Drohnenaufnahme')}" loading="lazy"><div class="gallery-caption">${ThurSkyContent.escape(x.title||x.caption||'Drohnenaufnahme')}</div></article>`).join('');
  const lb=document.querySelector('[data-lightbox]'), lbImg=document.querySelector('[data-lightbox-image]'); let current=0;
  const show=i=>{ current=(i+images.length)%images.length; lbImg.src=images[current].image; lbImg.alt=images[current].alt||images[current].title||'Drohnenaufnahme'; lb.classList.add('open'); };
  grid.addEventListener('click',e=>{const item=e.target.closest('[data-gallery-index]');if(item)show(Number(item.dataset.galleryIndex));});
  grid.addEventListener('keydown',e=>{const item=e.target.closest('[data-gallery-index]');if(item&&(e.key==='Enter'||e.key===' ')){e.preventDefault();show(Number(item.dataset.galleryIndex));}});
  document.querySelector('[data-lightbox-close]')?.addEventListener('click',()=>lb.classList.remove('open'));
  document.querySelector('[data-lightbox-prev]')?.addEventListener('click',()=>show(current-1));
  document.querySelector('[data-lightbox-next]')?.addEventListener('click',()=>show(current+1));
  lb?.addEventListener('click',e=>{if(e.target===lb)lb.classList.remove('open')});
  document.addEventListener('keydown',e=>{if(!lb?.classList.contains('open'))return;if(e.key==='Escape')lb.classList.remove('open');if(e.key==='ArrowLeft')show(current-1);if(e.key==='ArrowRight')show(current+1);});
})();
