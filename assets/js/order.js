(() => {
  const loginBox=document.querySelector('[data-order-login]');
  const orderBox=document.querySelector('[data-order-box]');
  const form=document.querySelector('[data-order-form]');
  const result=document.querySelector('[data-order-result]');
  if(!loginBox||!orderBox||!form)return;
  const render=user=>{loginBox.classList.toggle('hidden',!!user);orderBox.classList.toggle('hidden',!user);const email=document.querySelector('[data-order-email]');if(email&&user)email.textContent=user.email;};
  const current=()=>window.ThurSkyAuth?.currentUser();
  const start=()=>render(current());
  window.addEventListener('thursky:login',e=>render(e.detail));
  window.addEventListener('thursky:logout',()=>render(null));
  setTimeout(start,0);
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!current()){window.ThurSkyAuth?.openLogin();return;}
    result.className='notice';result.textContent='Anfrage wird gespeichert …';
    const fd=new FormData(form);
    try{
      const data=await ThurSkyApi.request('/.netlify/functions/orders',{method:'POST',body:JSON.stringify(Object.fromEntries(fd.entries()))});
      result.className='notice success';result.textContent=`Danke! Deine Anfrage ${data.order?.order_number||''} wurde gespeichert.`;form.reset();
    }catch(err){result.className='notice error';result.textContent=`Fehler: ${err.message}`;}
  });
})();
