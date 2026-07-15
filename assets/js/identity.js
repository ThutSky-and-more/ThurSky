(() => {
  const ni = window.netlifyIdentity;
  if (!ni) return;
  ni.init();
  const rolesOf = user => user?.app_metadata?.roles || [];
  const update = user => {
    document.querySelectorAll('[data-auth-label]').forEach(el => el.textContent = user ? user.email : 'Kundenkonto');
    document.querySelectorAll('[data-admin-only]').forEach(el => el.classList.toggle('hidden', !rolesOf(user).includes('admin')));
    document.querySelectorAll('[data-logout]').forEach(el => el.classList.toggle('hidden', !user));
  };
  ni.on('init', update);
  ni.on('login', user => { ni.close(); update(user); window.dispatchEvent(new CustomEvent('thursky:login',{detail:user})); });
  ni.on('logout', () => { update(null); window.dispatchEvent(new Event('thursky:logout')); });
  document.addEventListener('click', e => {
    const login = e.target.closest('[data-login]');
    const signup = e.target.closest('[data-signup]');
    const logout = e.target.closest('[data-logout]');
    if (login) ni.open('login');
    if (signup) ni.open('signup');
    if (logout) ni.logout();
  });
  update(ni.currentUser());
  window.ThurSkyAuth = { currentUser:()=>ni.currentUser(), rolesOf, jwt:async()=>{ const u=ni.currentUser(); return u ? u.jwt() : null; }, openLogin:()=>ni.open('login'), openSignup:()=>ni.open('signup') };
})();
