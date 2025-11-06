// Normaliza la URL base del API para evitar barras finales y duplicados de /api/v1
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
// Quitar barras finales
let cleanApiUrl = rawApiUrl.replace(/\/+$/, "");
// Colapsar múltiples ocurrencias de /api/v1 a una sola
cleanApiUrl = cleanApiUrl.replace(/(\/api\/v1)+(?=\/|$)/, "/api/v1");

export const API_URL = cleanApiUrl;
