import requests
import time

# Configuración
URL = "http://localhost:8000/api/v1/chat/"
LIMIT = 15  # Haremos 15 peticiones (el límite es 10/minuto)

print(f"🔥 INICIANDO TEST DE BÚNKER: Lanzando {LIMIT} peticiones seguidas...")
print("-" * 50)

for i in range(1, LIMIT + 1):
    try:
        # Enviamos petición rápida
        response = requests.post(
            URL, 
            json={"input": "spam test", "conversation_id": "test-bunker"},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            print(f"Intento #{i:02}: ✅ 200 OK (Pasó)")
        elif response.status_code == 429:
            print(f"Intento #{i:02}: 🛡️ 429 BLOQUEADO (¡Búnker Activo!)")
            print(f"   🛑 Respuesta del Server: {response.json()}")
        else:
            print(f"Intento #{i:02}: ⚠️ {response.status_code} (Inesperado)")
            
    except Exception as e:
        print(f"Error conectando: {e}")

print("-" * 50)
print("🏁 Test finalizado. Revisa tus LOGS del backend para ver la alerta roja.")