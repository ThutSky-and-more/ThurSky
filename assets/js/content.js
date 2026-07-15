window.ThurSkyContent = {
  async load(path, fallback) {
    try { const r = await fetch(path,{cache:'no-store'}); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
    catch (e) { console.warn('Inhalt konnte nicht geladen werden:',path,e); return fallback; }
  },
  escape(value='') { const d=document.createElement('div'); d.textContent=String(value); return d.innerHTML; }
};
