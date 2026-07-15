export const STATUS_LABELS = { received:"Anfrage eingegangen", planning:"Termin wird geplant", confirmed:"Termin bestätigt", recorded:"Aufnahmen erstellt", editing:"In Bearbeitung", ready:"Bereit zum Download", completed:"Abgeschlossen", cancelled:"Storniert" };
export const VALID_STATUSES = Object.keys(STATUS_LABELS);
export const withStatusLabel = (order) => ({ ...order, status_label: STATUS_LABELS[order.status] || order.status });
export const makeOrderNumber = () => `TS-${new Date().getFullYear()}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
