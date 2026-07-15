const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
exports.json=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)});
exports.fail=(err)=>{console.error(err);const statusCode=Number(err.statusCode)||500;return exports.json(statusCode,{error:statusCode===500?'Interner Serverfehler':err.message,details:process.env.NODE_ENV==='development'?String(err.stack||err):undefined});};
exports.httpError=(statusCode,message)=>Object.assign(new Error(message),{statusCode});
exports.body=(event)=>{try{return event.body?JSON.parse(event.body):{};}catch{throw exports.httpError(400,'Ungültige JSON-Daten.');}};
