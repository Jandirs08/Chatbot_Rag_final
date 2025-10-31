#!/usr/bin/env python3
"""
Test completo para PR #3: Middleware de Autenticación
Verifica que las rutas administrativas estén protegidas y las públicas accesibles.
"""
import asyncio
import aiohttp
import json
import sys
from typing import Dict, Any, Optional

# Configuración del servidor
BASE_URL = "http://localhost:8000"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"

class MiddlewareTestSuite:
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.admin_token: Optional[str] = None
        self.test_results = []
        
    async def setup(self):
        """Configurar sesión HTTP."""
        self.session = aiohttp.ClientSession()
        
    async def cleanup(self):
        """Limpiar recursos."""
        if self.session:
            await self.session.close()
    
    async def login_admin(self) -> bool:
        """Hacer login como admin y obtener token."""
        try:
            login_data = {
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            }
            
            async with self.session.post(
                f"{BASE_URL}/api/v1/auth/login",
                json=login_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    self.admin_token = data.get("access_token")
                    self.log_test("Admin Login", True, f"Token obtenido: {self.admin_token[:20]}...")
                    return True
                else:
                    error_text = await response.text()
                    self.log_test("Admin Login", False, f"Status: {response.status}, Error: {error_text}")
                    return False
                    
        except Exception as e:
            self.log_test("Admin Login", False, f"Exception: {str(e)}")
            return False
    
    def get_auth_headers(self) -> Dict[str, str]:
        """Obtener headers de autenticación."""
        if not self.admin_token:
            return {}
        return {"Authorization": f"Bearer {self.admin_token}"}
    
    async def test_public_routes(self):
        """Probar que las rutas públicas son accesibles sin autenticación."""
        public_routes = [
            ("GET", "/health", "Health Check"),
            ("GET", "/api/v1/chat/stats", "Chat Stats"),
        ]
        
        for method, path, description in public_routes:
            try:
                async with self.session.request(method, f"{BASE_URL}{path}") as response:
                    # Las rutas públicas deberían ser accesibles (200, 404, etc. pero NO 401/403)
                    success = response.status not in [401, 403]
                    status_msg = f"Status: {response.status}"
                    if not success:
                        error_text = await response.text()
                        status_msg += f", Error: {error_text}"
                    
                    self.log_test(f"Public Route: {description}", success, status_msg)
                    
            except Exception as e:
                self.log_test(f"Public Route: {description}", False, f"Exception: {str(e)}")
    
    async def test_protected_routes_without_auth(self):
        """Probar que las rutas protegidas rechazan requests sin autenticación."""
        protected_routes = [
            ("GET", "/api/v1/pdf/list", "PDF List"),
            ("GET", "/api/v1/rag/rag-status", "RAG Status"),
            ("GET", "/api/v1/bot/state", "Bot State"),
        ]
        
        for method, path, description in protected_routes:
            try:
                async with self.session.request(method, f"{BASE_URL}{path}") as response:
                    # Las rutas protegidas deberían rechazar sin auth (401)
                    success = response.status == 401
                    status_msg = f"Status: {response.status}"
                    if response.status == 401:
                        status_msg += " (Correctamente rechazado)"
                    else:
                        error_text = await response.text()
                        status_msg += f", Unexpected response: {error_text}"
                    
                    self.log_test(f"Protected Route (No Auth): {description}", success, status_msg)
                    
            except Exception as e:
                self.log_test(f"Protected Route (No Auth): {description}", False, f"Exception: {str(e)}")
    
    async def test_protected_routes_with_invalid_token(self):
        """Probar que las rutas protegidas rechazan tokens inválidos."""
        protected_routes = [
            ("GET", "/api/v1/pdf/list", "PDF List"),
            ("GET", "/api/v1/rag/rag-status", "RAG Status"),
            ("GET", "/api/v1/bot/state", "Bot State"),
        ]
        
        invalid_headers = {"Authorization": "Bearer invalid_token_12345"}
        
        for method, path, description in protected_routes:
            try:
                async with self.session.request(
                    method, 
                    f"{BASE_URL}{path}",
                    headers=invalid_headers
                ) as response:
                    # Las rutas protegidas deberían rechazar tokens inválidos (403)
                    success = response.status in [401, 403]
                    status_msg = f"Status: {response.status}"
                    if success:
                        status_msg += " (Correctamente rechazado)"
                    else:
                        error_text = await response.text()
                        status_msg += f", Unexpected response: {error_text}"
                    
                    self.log_test(f"Protected Route (Invalid Token): {description}", success, status_msg)
                    
            except Exception as e:
                self.log_test(f"Protected Route (Invalid Token): {description}", False, f"Exception: {str(e)}")
    
    async def test_protected_routes_with_valid_token(self):
        """Probar que las rutas protegidas permiten acceso con token válido de admin."""
        if not self.admin_token:
            self.log_test("Protected Routes (Valid Token)", False, "No admin token available")
            return
            
        protected_routes = [
            ("GET", "/api/v1/pdf/list", "PDF List"),
            ("GET", "/api/v1/rag/rag-status", "RAG Status"),
            ("GET", "/api/v1/bot/state", "Bot State"),
        ]
        
        auth_headers = self.get_auth_headers()
        
        for method, path, description in protected_routes:
            try:
                async with self.session.request(
                    method, 
                    f"{BASE_URL}{path}",
                    headers=auth_headers
                ) as response:
                    # Las rutas protegidas deberían permitir acceso con token válido (200, 404, etc. pero NO 401/403)
                    success = response.status not in [401, 403]
                    status_msg = f"Status: {response.status}"
                    if success:
                        status_msg += " (Acceso autorizado)"
                    else:
                        error_text = await response.text()
                        status_msg += f", Access denied: {error_text}"
                    
                    self.log_test(f"Protected Route (Valid Token): {description}", success, status_msg)
                    
            except Exception as e:
                self.log_test(f"Protected Route (Valid Token): {description}", False, f"Exception: {str(e)}")
    
    async def test_auth_routes_accessibility(self):
        """Probar que las rutas de autenticación son accesibles."""
        # Test profile endpoint with valid token
        if self.admin_token:
            try:
                auth_headers = self.get_auth_headers()
                async with self.session.get(
                    f"{BASE_URL}/api/v1/auth/me",
                    headers=auth_headers
                ) as response:
                    success = response.status == 200
                    status_msg = f"Status: {response.status}"
                    if success:
                        data = await response.json()
                        status_msg += f", User: {data.get('email', 'Unknown')}"
                    else:
                        error_text = await response.text()
                        status_msg += f", Error: {error_text}"
                    
                    self.log_test("Auth Route: Profile (/me)", success, status_msg)
                    
            except Exception as e:
                self.log_test("Auth Route: Profile (/me)", False, f"Exception: {str(e)}")
    
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Registrar resultado de prueba."""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "success": success,
            "details": details
        }
        self.test_results.append(result)
        print(f"{status} {test_name}: {details}")
    
    def print_summary(self):
        """Imprimir resumen de resultados."""
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print("\n" + "="*80)
        print("📊 RESUMEN DE PRUEBAS PR #3 - MIDDLEWARE DE AUTENTICACIÓN")
        print("="*80)
        print(f"Total de pruebas: {total_tests}")
        print(f"✅ Exitosas: {passed_tests}")
        print(f"❌ Fallidas: {failed_tests}")
        print(f"📈 Porcentaje de éxito: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n❌ PRUEBAS FALLIDAS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        print("\n🎯 ESTADO DEL PR #3:")
        if failed_tests == 0:
            print("✅ PR #3 COMPLETAMENTE FUNCIONAL - Middleware de autenticación trabajando correctamente")
        elif failed_tests <= 2:
            print("⚠️ PR #3 MAYORMENTE FUNCIONAL - Algunos ajustes menores necesarios")
        else:
            print("❌ PR #3 REQUIERE ATENCIÓN - Problemas significativos detectados")
        
        return failed_tests == 0

async def main():
    """Función principal para ejecutar todas las pruebas."""
    print("🚀 Iniciando pruebas del PR #3: Middleware de Autenticación")
    print("="*80)
    
    test_suite = MiddlewareTestSuite()
    
    try:
        await test_suite.setup()
        
        # 1. Login como admin
        print("\n1️⃣ AUTENTICACIÓN ADMIN")
        login_success = await test_suite.login_admin()
        
        if not login_success:
            print("❌ No se pudo hacer login como admin. Verificar que el servidor esté corriendo y el admin exista.")
            return False
        
        # 2. Probar rutas públicas
        print("\n2️⃣ RUTAS PÚBLICAS (Sin autenticación requerida)")
        await test_suite.test_public_routes()
        
        # 3. Probar rutas protegidas sin autenticación
        print("\n3️⃣ RUTAS PROTEGIDAS (Sin token - debe rechazar)")
        await test_suite.test_protected_routes_without_auth()
        
        # 4. Probar rutas protegidas con token inválido
        print("\n4️⃣ RUTAS PROTEGIDAS (Token inválido - debe rechazar)")
        await test_suite.test_protected_routes_with_invalid_token()
        
        # 5. Probar rutas protegidas con token válido
        print("\n5️⃣ RUTAS PROTEGIDAS (Token válido - debe permitir)")
        await test_suite.test_protected_routes_with_valid_token()
        
        # 6. Probar rutas de autenticación
        print("\n6️⃣ RUTAS DE AUTENTICACIÓN")
        await test_suite.test_auth_routes_accessibility()
        
        # Mostrar resumen
        success = test_suite.print_summary()
        return success
        
    except Exception as e:
        print(f"❌ Error fatal durante las pruebas: {str(e)}")
        return False
        
    finally:
        await test_suite.cleanup()

if __name__ == "__main__":
    try:
        success = asyncio.run(main())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️ Pruebas interrumpidas por el usuario")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error inesperado: {str(e)}")
        sys.exit(1)