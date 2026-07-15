(() => {
  const toggle = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-site-nav]');
  if (toggle && nav) {
    const close = () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); };
    toggle.addEventListener('click', (e) => { e.stopPropagation(); const open = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded',String(open)); });
    nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
    document.addEventListener('click', e => { if (!nav.contains(e.target) && e.target !== toggle) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }
  document.querySelectorAll('img[data-fallback]').forEach(img => {
    img.addEventListener('error', () => {
      const fallback = img.dataset.fallback;
      if (fallback && img.src !== new URL(fallback, location.origin).href) img.src = fallback;
      else img.style.display = 'none';
    }, { once:false });
  });
})();
