"""
Test PDF upload rate limiting functionality.

Este test verifica que el rate limit de 5/hour se aplica correctamente
al endpoint de carga de PDFs, protegiendo contra DoS attacks.
"""
import asyncio
import time
from io import BytesIO


def create_dummy_pdf(content: str = "dummy content") -> BytesIO:
    """Crea un PDF dummy para testing."""
    pdf_content = f"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\n{content}\n%%EOF"
    return BytesIO(pdf_content.encode())


async def test_pdf_upload_rate_limit_sequential():
    """
    Test manual para verificar rate limiting en uploads secuenciales.
    
    Ejecutar mientras el backend está corriendo:
    python backend/test_pdf_rate_limit.py
    
    Requiere:
    - Backend corriendo en localhost:8000
    - Redis disponible
    - ENABLE_RATE_LIMITING=true
    - Usuario autenticado
    """
    import httpx
    
    base_url = "http://localhost:8000"
    endpoint = f"{base_url}/api/v1/pdfs/upload"
    
    print("[TEST] Iniciando test de rate limiting para PDFs...")
    print(f"[CONFIG] Limite configurado: 5 uploads/hora")
    print(f"[TARGET] Endpoint: {endpoint}\n")
    
    # PASO 1: Autenticación
    print("[AUTH] Obteniendo token de autenticacion...")
    auth_endpoint = f"{base_url}/api/v1/auth/login"
    
    credentials = {
        "email": "jandir.088@hotmail.com",
        "password": "PPjhst1234$$"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            auth_response = await client.post(auth_endpoint, json=credentials)
            if auth_response.status_code != 200:
                print(f"[ERROR] Autenticacion fallida: {auth_response.status_code}")
                print(f"[ERROR] Response: {auth_response.text}")
                return {"error": "authentication_failed"}
            
            token_data = auth_response.json()
            token = token_data.get("access_token")
            
            if not token:
                print("[ERROR] No se recibio token en la respuesta")
                return {"error": "no_token"}
            
            print(f"[OK] Token obtenido exitosamente")
            
        except Exception as e:
            print(f"[ERROR] Error en autenticacion: {e}")
            return {"error": str(e)}
        
        # PASO 2: Headers con autenticación
        headers = {
            "Authorization": f"Bearer {token}"
        }
    
        results = []
        headers_info = []
        
        # PASO 3: Intentar 6 uploads consecutivos
        print(f"\n[TEST] Iniciando uploads con autenticacion...")
        for i in range(1, 7):
            # Crear PDF único para evitar deduplicación por hash
            pdf_content = create_dummy_pdf(f"Test PDF {i} - {time.time()}")
            
            files = {
                "file": (f"test_rate_limit_{i}.pdf", pdf_content, "application/pdf")
            }
            
            try:
                response = await client.post(endpoint, files=files, headers=headers)
                status = response.status_code
                results.append(status)
                
                # Capturar rate limit headers
                headers_resp = {
                    "X-RateLimit-Limit": response.headers.get("X-RateLimit-Limit"),
                    "X-RateLimit-Remaining": response.headers.get("X-RateLimit-Remaining"),
                    "X-RateLimit-Reset": response.headers.get("X-RateLimit-Reset"),
                    "Retry-After": response.headers.get("Retry-After")
                }
                headers_info.append(headers_resp)
                
                # Log resultado
                if status == 200:
                    print(f"[OK] Upload {i}: SUCCESS (200)")
                elif status == 409:
                    print(f"[WARN] Upload {i}: DUPLICADO (409)")
                elif status == 429:
                    print(f"[BLOCKED] Upload {i}: RATE LIMITED (429)")
                    print(f"   Retry-After: {headers_resp['Retry-After']} seconds")
                else:
                    print(f"[ERROR] Upload {i}: ERROR ({status})")
                
                # Mostrar headers de rate limiting
                if headers_resp["X-RateLimit-Limit"]:
                    print(f"   Rate Limit: {headers_resp['X-RateLimit-Remaining']}/{headers_resp['X-RateLimit-Limit']} remaining")
                
            except Exception as e:
                print(f"[ERROR] Upload {i}: EXCEPTION - {e}")
                results.append(0)
                headers_info.append({})
            
            # Pequeña pausa entre requests
            await asyncio.sleep(0.2)
    
    # Análisis de resultados
    print("\n" + "="*60)
    print("RESUMEN DE RESULTADOS")
    print("="*60)
    
    success_count = sum(1 for r in results if r in [200, 409])
    rate_limited_count = sum(1 for r in results if r == 429)
    
    print(f"\n[OK] Uploads exitosos/duplicados: {success_count}")
    print(f"[BLOCKED] Uploads bloqueados (429): {rate_limited_count}")
    print(f"[DATA] Codigos de estado: {results}")
    
    # Verificar comportamiento esperado
    print("\n" + "="*60)
    print("VERIFICACION")
    print("="*60)
    
    if rate_limited_count > 0:
        print("[PASS] Rate limiting esta ACTIVO")
        print(f"   Primer bloqueo en upload #{results.index(429) + 1}")
        
        # Verificar headers del último request (bloqueado)
        last_headers = headers_info[-1]
        if last_headers.get("Retry-After"):
            retry_after = last_headers["Retry-After"]
            print(f"[PASS] Retry-After header presente: {retry_after} seconds")
            # Para 5/hour, debería ser 3600 segundos
            if retry_after == "3600":
                print("[PASS] Retry-After correcto para limite de 5/hour")
            else:
                print(f"[WARN] Retry-After inesperado: esperado 3600, recibido {retry_after}")
        else:
            print("[WARN] Retry-After header no encontrado")
            
    else:
        print("[FAIL] ADVERTENCIA: Ningun upload fue bloqueado")
        print("   Posibles causas:")
        print("   - ENABLE_RATE_LIMITING=false")
        print("   - Redis no disponible")
        print("   - Limite configurado muy alto")
    
    # Verificar que NO se bloqueó antes del límite
    if results[0:5].count(429) > 0:
        print("[FAIL] ERROR: Se bloqueo antes de alcanzar el limite de 5")
    else:
        print("[PASS] Primeros 5 uploads no fueron bloqueados prematuramente")
    
    print("\n" + "="*60)
    print("Test completado")
    print("="*60)
    
    return {
        "results": results,
        "headers": headers_info,
        "success_count": success_count,
        "rate_limited_count": rate_limited_count
    }


async def test_other_endpoints_not_affected():
    """Verificar que el rate limit de PDFs no afecta otros endpoints."""
    import httpx
    
    print("\n[TEST] Verificando que otros endpoints NO estan afectados...")
    
    base_url = "http://localhost:8000"
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Primero agotar el rate limit de PDFs
        for i in range(6):
            pdf_content = create_dummy_pdf(f"Exhaust {i}")
            files = {"file": (f"exhaust_{i}.pdf", pdf_content, "application/pdf")}
            await client.post(f"{base_url}/api/v1/pdfs/upload", files=files)
        
        # Ahora verificar otros endpoints
        endpoints_to_test = [
            ("/api/v1/pdfs/list", "GET"),
            ("/api/v1/health", "GET"),
        ]
        
        all_ok = True
        for path, method in endpoints_to_test:
            try:
                if method == "GET":
                    response = await client.get(f"{base_url}{path}")
                    
                if response.status_code == 429:
                    print(f"[FAIL] {path} esta bloqueado (no deberia)")
                    all_ok = False
                else:
                    print(f"[PASS] {path} funciona correctamente ({response.status_code})")
            except Exception as e:
                print(f"[WARN] {path} error: {e}")
        
        if all_ok:
            print("\n[PASS] Rate limiting de PDFs es independiente - otros endpoints funcionan")
        else:
            print("\n[FAIL] PROBLEMA: Rate limiting afecta otros endpoints")
    
    return all_ok


if __name__ == "__main__":
    print("="*60)
    print("TEST DE RATE LIMITING PARA PDF UPLOADS")
    print("="*60)
    print("\nREQUISITOS:")
    print("  1. Backend debe estar corriendo (uvicorn main:app)")
    print("  2. Redis debe estar disponible")
    print("  3. ENABLE_RATE_LIMITING=true en config\n")
    
    input("Presiona ENTER para continuar...")
    
    # Test principal
    results = asyncio.run(test_pdf_upload_rate_limit_sequential())
    
    # Test de independencia
    asyncio.run(test_other_endpoints_not_affected())
    
    print("\nTodos los tests completados")
