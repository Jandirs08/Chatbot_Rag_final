import httpx
import asyncio
import random
from utils.logging_utils import get_logger
from config import settings

class WhatsAppClient:
    """
    Cliente asíncrono para enviar mensajes a través de la API de WhatsApp (Twilio).
    Incluye manejo robusto de Rate Limits (429), reintentos exponenciales y reutilización de conexiones TCP.
    """
    
    def __init__(self):
        self.logger = get_logger(self.__class__.__name__)
        self.account_sid = getattr(settings, "twilio_account_sid", None)
        self.auth_token = getattr(settings, "twilio_auth_token", None)
        from_number_raw = getattr(settings, "twilio_whatsapp_from", None)
        self.from_number = str(from_number_raw or "").strip().strip("`\"'")
        api_base_raw = getattr(settings, "twilio_api_base", "https://api.twilio.com")
        self.api_base = str(api_base_raw).strip().strip("`\"'")

    def _calculate_delay(self, attempt: int) -> float:
        """
        Calcula el tiempo de espera usando Backoff Exponencial con Jitter.
        Formula: 2^(intento-1) + variacion_aleatoria
        """
        base_delay = 2 ** (attempt - 1)
        jitter = random.uniform(0, base_delay * 0.3)
        return base_delay + jitter

    async def send_text(self, wa_id: str, text: str) -> bool:
        """
        Envía un mensaje de texto a un usuario de WhatsApp.
        Retorna True si el envío fue exitoso (HTTP 2xx), False en caso contrario.
        """
        # Validación de configuración (Punto 5: Preferimos log y return False para no romper el hilo background)
        if not self.account_sid or not self.auth_token or not self.from_number:
            self.logger.error("Configuración incompleta: Faltan credenciales de Twilio.")
            return False

        url = f"{self.api_base.rstrip('/')}/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {"From": self.from_number, "To": wa_id, "Body": text}

        max_attempts = 5
        attempt = 0

        # OPTIMIZACIÓN (Punto 4): Cliente fuera del bucle para reusar conexión SSL (Keep-Alive)
        async with httpx.AsyncClient(timeout=10.0) as client:
            while attempt < max_attempts:
                try:
                    attempt += 1
                    resp = await client.post(
                        url,
                        data=data,
                        headers=headers,
                        auth=(self.account_sid, self.auth_token),
                    )

                    # 1. Éxito
                    if 200 <= resp.status_code < 300:
                        return True

                    # 2. Errores Fatales (No reintentar)
                    # 400: Bad Request (número inválido, body vacío)
                    # 401/403: Auth error
                    if resp.status_code in (400, 401, 403):
                        self.logger.error(f"Error fatal Twilio ({resp.status_code}). No se reintenta. Body: {resp.text[:200]}")
                        return False

                    # 3. Rate Limiting (HTTP 429)
                    if resp.status_code == 429:
                        if attempt >= max_attempts:
                            self.logger.error("Rate limit (429) persistente tras reintentos. Abortando.")
                            return False
                        
                        delay = self._calculate_delay(attempt)
                        self.logger.warning(f"Twilio Rate Limit (429). Reintento {attempt}/{max_attempts} en {delay:.2f}s")
                        await asyncio.sleep(delay)
                        continue

                    # 4. Errores de Servidor (5xx)
                    if 500 <= resp.status_code < 600:
                        if attempt >= max_attempts:
                            self.logger.error(f"Fallo servidor Twilio ({resp.status_code}) tras reintentos.")
                            return False

                        delay = self._calculate_delay(attempt)
                        self.logger.warning(f"Error servidor Twilio {resp.status_code}. Reintento {attempt}/{max_attempts} en {delay:.2f}s")
                        await asyncio.sleep(delay)
                        continue

                    # 5. Análisis de Error Lógico (Punto 3: Validación Content-Type)
                    twilio_code = None
                    ct = resp.headers.get("Content-Type", "")
                    
                    if "application/json" in ct or "application/problem+json" in ct:
                        try:
                            resp_json = resp.json()
                            twilio_code = resp_json.get("code")
                        except ValueError:
                            self.logger.warning("El header dice JSON pero falló el parseo.")
                    
                    # Código específico de Rate Limit en el body (20429)
                    if twilio_code == 20429: 
                        if attempt >= max_attempts:
                            self.logger.error("Rate limit Twilio (20429) persistente. Abortando.")
                            return False
                            
                        delay = self._calculate_delay(attempt)
                        self.logger.warning(f"Twilio Code 20429. Reintento {attempt}/{max_attempts} en {delay:.2f}s")
                        await asyncio.sleep(delay)
                        continue
                    
                    # Si llegamos aquí, es un error desconocido (ni 429, ni 5xx, ni 20429)
                    self.logger.error(f"Error desconocido Twilio: {resp.status_code} - {resp.text[:300]}")
                    return False

                except httpx.RequestError as e:
                    # Errores de red (DNS, timeout)
                    if attempt >= max_attempts:
                        self.logger.error(f"Error de red persistente: {e}")
                        return False
                    
                    delay = self._calculate_delay(attempt)
                    self.logger.warning(f"Error de red ({e}). Reintento {attempt}/{max_attempts} en {delay:.2f}s")
                    await asyncio.sleep(delay)

                except Exception:
                    # PUNTO 2: Log con Stack Trace completo usando 'logger.exception'
                    self.logger.exception("Excepción crítica inesperada en send_text")
                    return False

        return False

    async def send_text_diagnostics(self, wa_id: str, text: str) -> dict:
        """
        Método simple para herramientas de diagnóstico. No tiene reintentos complejos.
        """
        if not self.account_sid or not self.auth_token or not self.from_number:
            return {"ok": False, "status": 400, "body": {"message": "Credenciales Twilio incompletas"}}

        url = f"{self.api_base.rstrip('/')}/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {"From": self.from_number, "To": wa_id, "Body": text}
        try:
            # Timeout corto para diagnósticos (Punto 8 del reporte)
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(url, data=data, headers=headers, auth=(self.account_sid, self.auth_token))
            
            body = None
            try:
                body = resp.json()
            except Exception:
                body = (resp.text or "")[:500]
                
            return {"ok": 200 <= resp.status_code < 300, "status": resp.status_code, "body": body}
        except Exception as e:
            return {"ok": False, "status": 500, "body": {"message": str(e)}}