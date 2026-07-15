const {httpError}=require('./response');
exports.user=(context)=>{const user=context?.clientContext?.user;if(!user)throw httpError(401,'Bitte zuerst einloggen.');return user;};
exports.roles=(user)=>user?.app_metadata?.roles||[];
exports.admin=(context)=>{const user=exports.user(context);if(!exports.roles(user).includes('admin'))throw httpError(403,'Nur Admins dürfen diese Funktion verwenden.');return user;};
