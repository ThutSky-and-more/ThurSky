const {db}=require('./_shared/supabase');
const {user,roles,admin}=require('./_shared/auth');
const {json,fail,httpError,body}=require('./_shared/response');
const {statuses,labels,number}=require('./_shared/orders');
exports.handler=async(event,context)=>{try{
 const u=user(context),isAdmin=roles(u).includes('admin'),s=db();
 if(event.httpMethod==='GET'){
  let q=s.from('orders').select('*, order_files(id,original_name,mime_type,size_bytes,created_at)').order('created_at',{ascending:false});
  if(!(isAdmin&&event.queryStringParameters?.scope==='all'))q=q.eq('customer_id',u.id);
  const {data,error}=await q;if(error)throw error;
  return json(200,{orders:(data||[]).map(o=>({...o,status_label:labels[o.status]||o.status,files:o.order_files||[],order_files:undefined}))});
 }
 if(event.httpMethod==='POST'){
  const b=body(event);if(!String(b.package_name||'').trim())throw httpError(400,'Bitte eine Leistung auswählen.');
  const row={order_number:number(),customer_id:u.id,customer_email:u.email,package_name:String(b.package_name).trim(),status:'received',desired_date:b.desired_date||null,street:String(b.street||'').trim()||null,postal_code:String(b.postal_code||'').trim()||null,city:String(b.city||'').trim()||null,customer_message:String(b.customer_message||'').trim()||null};
  const {data,error}=await s.from('orders').insert(row).select().single();if(error)throw error;return json(201,{order:data});
 }
 if(event.httpMethod==='PATCH'){
  admin(context);const b=body(event);if(!b.id)throw httpError(400,'Bestell-ID fehlt.');if(!statuses.includes(b.status))throw httpError(400,'Ungültiger Status.');
  const patch={status:b.status,admin_message:String(b.admin_message||'').trim()||null,updated_at:new Date().toISOString()};
  const {data,error}=await s.from('orders').update(patch).eq('id',b.id).select().single();if(error)throw error;return json(200,{order:data});
 }
 throw httpError(405,'Methode nicht erlaubt.');
}catch(err){return fail(err);}};
