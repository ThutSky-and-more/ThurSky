exports.statuses=['received','planning','confirmed','captured','editing','ready','completed','cancelled'];
exports.labels={received:'Anfrage eingegangen',planning:'Termin wird geplant',confirmed:'Termin bestätigt',captured:'Aufnahmen erstellt',editing:'In Bearbeitung',ready:'Bereit zum Download',completed:'Abgeschlossen',cancelled:'Storniert'};
exports.number=()=>`TS-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;
