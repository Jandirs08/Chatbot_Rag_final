"""
Tests de carga para el RAG Chatbot usando Locust.

Uso rápido:
    locust -f tests/load/locustfile.py --host http://localhost:8000

Luego abre http://localhost:8089 y configuras usuarios y duración desde la UI.

Sin UI (headless):
    locust -f tests/load/locustfile.py --host http://localhost:8000 \
        --headless --users 20 --spawn-rate 2 --run-time 5m

IMPORTANTE: el backend debe correr con rate limiting relajado:
    ENABLE_RATE_LIMITING=false  (o CHAT_RATE_LIMIT=10000/minute)
"""
import random
import time

from locust import HttpUser, between, task


PROMPTS = [
    "¿Qué servicios ofrecen?",
    "¿Cuánto cuesta el plan?",
    "Necesito información sobre precios",
    "¿Atienden en mi ciudad?",
    "Hola, tengo una consulta",
    "¿Tienen catálogo?",
    "Información de contacto",
    "Horarios de atención",
    "¿Cuál es el proceso de contratación?",
    "Necesito hablar con un asesor",
]


def _read_sse(response) -> tuple[bool, bool]:
    """Lee el body SSE y devuelve (has_error, has_end)."""
    has_error = False
    has_end = False
    try:
        body = response.content.decode("utf-8", errors="replace")
        has_error = "event: error" in body
        has_end = "event: end" in body
    except Exception:
        pass
    return has_error, has_end


class ChatUser(HttpUser):
    """Usuario con conversaciones frías (conversation_id nuevo cada turno)."""

    wait_time = between(1, 3)

    def on_start(self):
        # Verifica que el backend esté listo antes de generar carga.
        with self.client.get(
            "/api/v1/health/ready",
            name="health_ready",
            catch_response=True,
        ) as r:
            if r.status_code != 200:
                r.failure(f"Backend no listo: {r.status_code}")

    @task
    def chat_cold(self):
        prompt = random.choice(PROMPTS)
        conversation_id = f"locust-cold-{id(self)}-{time.time_ns()}"

        with self.client.post(
            "/api/v1/chat/",
            json={
                "input": prompt,
                "conversation_id": conversation_id,
                "source": "locust-load",
            },
            name="chat_stream",
            catch_response=True,
            timeout=35,
        ) as response:
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}")
                return

            has_error, has_end = _read_sse(response)

            if has_error:
                response.failure("SSE event:error — el LLM o backend falló")
            elif not has_end:
                response.failure("Stream no cerró (falta event:end)")
            else:
                response.success()


class WarmChatUser(HttpUser):
    """
    Usuario que reutiliza el mismo conversation_id.
    Ejercita el path de memoria del bot (historia de conversación).
    """

    wait_time = between(2, 5)

    def on_start(self):
        # ID fijo por VU — simula un usuario real que sigue hablando.
        self.conversation_id = f"locust-warm-{id(self)}"

    @task
    def chat_warm(self):
        prompt = random.choice(PROMPTS)

        with self.client.post(
            "/api/v1/chat/",
            json={
                "input": prompt,
                "conversation_id": self.conversation_id,
                "source": "locust-warm",
            },
            name="chat_stream_warm",
            catch_response=True,
            timeout=35,
        ) as response:
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}")
                return

            has_error, has_end = _read_sse(response)

            if has_error:
                response.failure("SSE event:error")
            elif not has_end:
                response.failure("Stream no cerró")
            else:
                response.success()
