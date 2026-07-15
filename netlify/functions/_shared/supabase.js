const {createClient}=require('@supabase/supabase-js');
let client;
exports.db=()=>{
 if(client)return client;
 const url=process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Supabase-Umgebungsvariablen fehlen.');
 client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 return client;
};
exports.bucket=()=>process.env.SUPABASE_STORAGE_BUCKET||'customer-files';
