import asyncio
import aiohttp
import time

URL = "http://localhost:8000/api/v1/chat"
CONCURRENT_USERS = 50  # Simular 50 personas a la vez
TOTAL_REQUESTS = 100

async def chat_user(session, user_id):
    payload = {
        "input": "Hola, ¿cómo estás?",
        "conversation_id": f"stress-test-{user_id}",
        "debug_mode": False 
    }
    try:
        start = time.time()
        # Simulamos que es streaming, pero leemos solo el status para no complicar el test
        async with session.post(URL, json=payload) as response:
            await response.read() # Leer respuesta
            duration = time.time() - start
            status = response.status
            print(f"User {user_id}: Status {status} - Tiempo: {duration:.2f}s")
            return status
    except Exception as e:
        print(f"User {user_id}: ERROR {e}")
        return 500

async def main():
    print(f"🔥 INICIANDO ATAQUE: {CONCURRENT_USERS} usuarios simultáneos...")
    
    async with aiohttp.ClientSession() as session:
        tasks = []
        for i in range(CONCURRENT_USERS):
            tasks.append(chat_user(session, i))
        
        start_total = time.time()
        results = await asyncio.gather(*tasks)
        end_total = time.time()

    success = results.count(200)
    print(f"\n📊 RESULTADOS:")
    print(f"✅ Éxitos: {success}")
    print(f"❌ Fallos: {len(results) - success}")
    print(f"⏱️ Tiempo Total para procesar {CONCURRENT_USERS} chats: {end_total - start_total:.2f}s")

if __name__ == "__main__":
    asyncio.run(main())