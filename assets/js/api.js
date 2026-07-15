window.ThurSkyApi={
 async request(path,options={}){
   const token=await window.ThurSkyAuth?.jwt();
   const headers={...(options.headers||{})};
   if(token)headers.authorization=`Bearer ${token}`;
   if(options.body && !(options.body instanceof FormData) && !headers['content-type'])headers['content-type']='application/json';
   const r=await fetch(path,{...options,headers});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||data.details||`HTTP ${r.status}`);
   return data;
 }
};
