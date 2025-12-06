# DEPENDENCIAS:
# pip install ragas langchain-openai datasets httpx pandas python-dotenv openai

import os
import json
import asyncio
import httpx
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision
from datasets import Dataset
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

# Cargar variables de entorno
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "backend", ".env"))

API_BASE_URL = "http://localhost:8000/api/v1"
CHAT_URL = f"{API_BASE_URL}/chat/"
LOGIN_URL = f"{API_BASE_URL}/auth/login"
DATASET_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "qa_dataset.json")

# Generar nombre de archivo con timestamp para evitar bloqueos
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
OUTPUT_CSV = os.path.join(os.path.dirname(os.path.dirname(__file__)), f"rag_eval_results_{timestamp}.csv")

# Credenciales para evaluación
TEST_USER = "jandir.088@hotmail.com"
TEST_PASS = "PPjhst1234$"

async def login_and_get_token(client):
    """Se autentica y devuelve el token de acceso."""
    print(f"🔐 Iniciando sesión como {TEST_USER}...")
    try:
        response = await client.post(LOGIN_URL, json={"email": TEST_USER, "password": TEST_PASS})
        if response.status_code == 200:
            data = response.json()
            token = data.get("access_token")
            print("✅ Login exitoso.")
            return token
        else:
            print(f"❌ Error Login ({response.status_code}): {response.text}")
            return None
    except Exception as e:
        print(f"❌ Excepción Login: {e}")
        return None

async def get_bot_response(client, question, token):
    """Envía la pregunta al bot y recupera respuesta y contextos consumiendo el stream SSE."""
    try:
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
        payload = {
            "input": question,
            "conversation_id": "eval_session_v1",
            "debug_mode": True
        }
        
        full_answer = ""
        contexts = []
        
        # Usar stream() para consumir SSE
        async with client.stream("POST", CHAT_URL, json=payload, headers=headers, timeout=120.0) as response:
            if response.status_code != 200:
                error_body = await response.aread()
                print(f"⚠️ Error API Chat ({response.status_code}): {error_body.decode('utf-8')[:200]}")
                return "Error de API", []

            current_event = None
            
            async for line in response.aiter_lines():
                line = line.strip()
                if not line:
                    continue
                
                if line.startswith("event:"):
                    current_event = line.split(":", 1)[1].strip()
                    continue
                
                if line.startswith("data:"):
                    data_str = line.split(":", 1)[1].strip()
                    
                    # Si es evento de error
                    if current_event == "error":
                        print(f"❌ Error en stream: {data_str}")
                        continue
                        
                    # Si es evento de debug (aquí vienen los documentos)
                    if current_event == "debug":
                        try:
                            debug_info = json.loads(data_str)
                            if "retrieved_documents" in debug_info:
                                for doc in debug_info["retrieved_documents"]:
                                    # Intentar extraer contenido de varias formas posibles
                                    content = doc.get("page_content") or doc.get("text") or str(doc)
                                    contexts.append(content)
                        except json.JSONDecodeError:
                            pass
                        continue
                        
                    # Si es data normal (stream de texto)
                    if not current_event:
                        try:
                            chunk_data = json.loads(data_str)
                            chunk_text = chunk_data.get("stream", "")
                            full_answer += chunk_text
                        except json.JSONDecodeError:
                            pass
                            
                # Reset event after processing data (SSE standard allows multi-line data but usually 1-1 in simple implementations)
                # Aquí asumimos que event precede a data y se resetea implícitamente o se mantiene hasta el próximo event
                # En nuestra implementación de backend:
                # yield f"event: debug\ndata: {json}\n\n"
                # yield f"data: {payload}\n\n" (sin event explícito es 'message')
                
                # Si acabamos de procesar una línea de data, el evento 'debug' o 'error' ya tuvo su efecto para esa línea.
                # Para el stream normal (sin event: ...), current_event debería ser None o vacío.
                if line.startswith("data:") and current_event in ["debug", "error", "end"]:
                     current_event = None

        return full_answer, contexts

    except Exception as e:
        print(f"❌ Excepción al llamar API: {e}")
        return "Error de Conexión", []

async def main():
    print("🚀 Iniciando Evaluación RAG con Ragas...")
    
    if not os.path.exists(DATASET_PATH):
        print(f"❌ No se encontró el dataset en {DATASET_PATH}")
        return

    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    questions = []
    ground_truths = []
    answers = []
    contexts_list = []

    async with httpx.AsyncClient(timeout=120.0) as client:
        # 1. Login
        token = await login_and_get_token(client)
        if not token:
            print("⚠️ Continuando sin token (puede fallar si la API requiere auth)...")

        # 2. Obtener Respuestas
        print(f"📡 Consultando API para {len(raw_data)} preguntas...")
        for i, item in enumerate(raw_data):
            q = item["question"]
            gt = item["ground_truth"]
            
            print(f"   [{i+1}/{len(raw_data)}] Preguntando: {q[:50]}...")
            ans, ctxs = await get_bot_response(client, q, token)
            
            # Validación básica
            if not ans:
                print("      ⚠️ Respuesta vacía recibida.")
            if not ctxs:
                print("      ⚠️ Sin contextos recibidos.")
            
            questions.append(q)
            ground_truths.append(gt)
            answers.append(ans)
            contexts_list.append(ctxs)

    # 3. Preparar Dataset
    # Asegurar que contexts sea list[list[str]] y ground_truth list[str]
    data_dict = {
        "question": questions,
        "answer": answers,
        "contexts": contexts_list,
        "ground_truth": ground_truths
    }
    ragas_dataset = Dataset.from_dict(data_dict)

    # 4. Configurar Modelos
    if not os.getenv("OPENAI_API_KEY"):
        print("⚠️ ADVERTENCIA: No se detectó OPENAI_API_KEY.")
    
    print("⚙️  Configurando Ragas con LangChain Wrappers...")
    
    # LLM
    openai_llm = ChatOpenAI(model="gpt-4o")
    
    # Embeddings: Usar LangChain wrapper explícito para máxima compatibilidad
    # Ragas usa internamente llamadas que esperan la interfaz de LangChain
    openai_embeddings = OpenAIEmbeddings()
    
    from ragas.llms import LangchainLLMWrapper
    from ragas.embeddings import LangchainEmbeddingsWrapper
    
    evaluator_llm = LangchainLLMWrapper(openai_llm)
    evaluator_embeddings = LangchainEmbeddingsWrapper(openai_embeddings)

    # 5. Ejecutar Evaluación
    print("⚖️  Ejecutando métricas (esto puede tardar unos minutos)...")
    try:
        results = evaluate(
            ragas_dataset,
            metrics=[
                faithfulness,
                answer_relevancy,
                context_precision,
            ],
            llm=evaluator_llm,
            embeddings=evaluator_embeddings
        )
        
        # 6. Reporte
        print("\n📊 Resultados Globales:")
        print(results)

        if hasattr(results, "to_pandas"):
            df_results = results.to_pandas()
            df_results.to_csv(OUTPUT_CSV, index=False, encoding="utf-8")
            print(f"💾 Resultados detallados guardados en: {OUTPUT_CSV}")
        
        # Safe access to scores
        # Result object behaves like a dict for aggregate scores
        
        print("\n" + "="*40)
        print("RESUMEN DE EVALUACIÓN")
        print("="*40)
        
        def get_score(name):
            try:
                val = results[name]
                if isinstance(val, (list, tuple)):
                    return sum(val) / len(val) if val else 0.0
                return float(val)
            except Exception:
                return 0.0

        print(f"🎯 Precisión de Contexto: {get_score('context_precision'):.4f}")
        print(f"🤥 Tasa de Fidelidad (Faithfulness): {get_score('faithfulness'):.4f}")
        print(f"🤖 Relevancia de Respuesta: {get_score('answer_relevancy'):.4f}")
        print("="*40)

    except Exception as e:
        print(f"❌ Error durante la evaluación con Ragas: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Windows SelectorEventLoop policy fix for asyncio if needed
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
