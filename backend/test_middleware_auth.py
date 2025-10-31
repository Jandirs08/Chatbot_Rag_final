#!/usr/bin/env python3
"""
Script de pruebas para verificar el middleware de autenticación
Prueba rutas públicas y protegidas con la instancia de Docker
"""

import requests
import json
import sys
from typing import Dict, Any

# Configuración del servidor (ajusta la URL según tu configuración de Docker)
BASE_URL = "http://localhost:8000"
API_V1 = f"{BASE_URL}/api/v1"

def print_test_result(test_name: str, success: bool, details: str = ""):
    """Imprime el resultado de una prueba con formato."""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} {test_name}")
    if details:
        print(f"   {details}")
    print()

def test_public_routes():
    """Prueba que las rutas públicas funcionen sin autenticación."""
    print("🌐 PROBANDO RUTAS PÚBLICAS (sin autenticación)")
    print("=" * 50)
    
    # Test 1: Health check
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        success = response.status_code == 200
        details = f"Status: {response.status_code}"
        if success:
            details += f", Response: {response.json()}"
        print_test_result("Health Check", success, details)
    except Exception as e:
        print_test_result("Health Check", False, f"Error: {str(e)}")
    
    # Test 2: Chat endpoint (público)
    try:
        chat_data = {
            "message": "Hola, esto es una prueba",
            "conversation_id": "test-conversation"
        }
        response = requests.post(f"{API_V1}/chat/stream_log", 
                               json=chat_data, 
                               timeout=10)
        # El chat puede devolver diferentes códigos según la implementación
        success = response.status_code in [200, 201, 422]  # 422 si faltan campos requeridos
        details = f"Status: {response.status_code}"
        print_test_result("Chat Endpoint (público)", success, details)
    except Exception as e:
        print_test_result("Chat Endpoint (público)", False, f"Error: {str(e)}")

def test_protected_routes_without_auth():
    """Prueba que las rutas protegidas rechacen acceso sin autenticación."""
    print("🔒 PROBANDO RUTAS PROTEGIDAS (sin autenticación - deben fallar)")
    print("=" * 60)
    
    protected_endpoints = [
        ("PDF Upload", "POST", f"{API_V1}/pdf/upload"),
        ("PDF List", "GET", f"{API_V1}/pdf/list"),
        ("RAG Status", "GET", f"{API_V1}/rag/rag-status"),
        ("Bot State", "GET", f"{API_V1}/bot/state"),
        ("Bot Toggle", "POST", f"{API_V1}/bot/toggle")
    ]
    
    for name, method, url in protected_endpoints:
        try:
            if method == "GET":
                response = requests.get(url, timeout=5)
            else:
                response = requests.post(url, json={}, timeout=5)
            
            # Esperamos 401 (Unauthorized) o 403 (Forbidden)
            success = response.status_code in [401, 403]
            details = f"Status: {response.status_code}"
            if not success:
                details += f", Response: {response.text[:100]}"
            print_test_result(f"{name} (debe rechazar)", success, details)
        except Exception as e:
            print_test_result(f"{name} (debe rechazar)", False, f"Error: {str(e)}")

def test_auth_endpoints():
    """Prueba los endpoints de autenticación."""
    print("🔑 PROBANDO ENDPOINTS DE AUTENTICACIÓN")
    print("=" * 40)
    
    # Test login con credenciales incorrectas
    try:
        login_data = {
            "username": "test_user",
            "password": "wrong_password"
        }
        response = requests.post(f"{API_V1}/auth/login", json=login_data, timeout=5)
        # Esperamos 401 para credenciales incorrectas
        success = response.status_code == 401
        details = f"Status: {response.status_code}"
        print_test_result("Login con credenciales incorrectas", success, details)
    except Exception as e:
        print_test_result("Login con credenciales incorrectas", False, f"Error: {str(e)}")
    
    # Test endpoint /me sin token
    try:
        response = requests.get(f"{API_V1}/auth/me", timeout=5)
        success = response.status_code == 401
        details = f"Status: {response.status_code}"
        print_test_result("Endpoint /me sin token", success, details)
    except Exception as e:
        print_test_result("Endpoint /me sin token", False, f"Error: {str(e)}")

def test_with_admin_credentials():
    """Prueba con credenciales de admin si están disponibles."""
    print("👑 PROBANDO CON CREDENCIALES DE ADMIN")
    print("=" * 40)
    
    # Intentar login con admin (credenciales por defecto del script init_admin.py)
    try:
        login_data = {
            "username": "admin",
            "password": "admin123"
        }
        response = requests.post(f"{API_V1}/auth/login", json=login_data, timeout=5)
        
        if response.status_code == 200:
            token_data = response.json()
            access_token = token_data.get("access_token")
            
            print_test_result("Login de admin", True, f"Token obtenido: {access_token[:20]}...")
            
            # Probar acceso a ruta protegida con token
            headers = {"Authorization": f"Bearer {access_token}"}
            
            # Test RAG Status con autenticación
            try:
                response = requests.get(f"{API_V1}/rag/rag-status", headers=headers, timeout=5)
                success = response.status_code == 200
                details = f"Status: {response.status_code}"
                if success:
                    details += f", Response keys: {list(response.json().keys())}"
                print_test_result("RAG Status con token admin", success, details)
            except Exception as e:
                print_test_result("RAG Status con token admin", False, f"Error: {str(e)}")
            
            # Test Bot State con autenticación
            try:
                response = requests.get(f"{API_V1}/bot/state", headers=headers, timeout=5)
                success = response.status_code == 200
                details = f"Status: {response.status_code}"
                print_test_result("Bot State con token admin", success, details)
            except Exception as e:
                print_test_result("Bot State con token admin", False, f"Error: {str(e)}")
                
        else:
            print_test_result("Login de admin", False, f"Status: {response.status_code}, Response: {response.text}")
            
    except Exception as e:
        print_test_result("Login de admin", False, f"Error: {str(e)}")

def main():
    """Ejecuta todas las pruebas del middleware."""
    print("🚀 INICIANDO PRUEBAS DEL MIDDLEWARE DE AUTENTICACIÓN")
    print("=" * 60)
    print(f"URL Base: {BASE_URL}")
    print()
    
    # Verificar que el servidor esté disponible
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code != 200:
            print("❌ El servidor no está disponible. Verifica que Docker esté corriendo.")
            sys.exit(1)
        print("✅ Servidor disponible, iniciando pruebas...")
        print()
    except Exception as e:
        print(f"❌ No se puede conectar al servidor: {str(e)}")
        print("   Verifica que Docker esté corriendo en el puerto 8000")
        sys.exit(1)
    
    # Ejecutar todas las pruebas
    test_public_routes()
    test_protected_routes_without_auth()
    test_auth_endpoints()
    test_with_admin_credentials()
    
    print("🏁 PRUEBAS COMPLETADAS")
    print("=" * 30)
    print("Si ves ✅ en la mayoría de las pruebas, el middleware está funcionando correctamente.")
    print("Si hay ❌, revisa los detalles para identificar problemas.")

if __name__ == "__main__":
    main()