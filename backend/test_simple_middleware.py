#!/usr/bin/env python3
"""
Script simple para probar el middleware de autenticación
"""

import requests
import json

BASE_URL = "http://localhost:8000"
API_V1 = f"{BASE_URL}/api/v1"

def test_health():
    """Prueba básica de conectividad"""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"✅ Health check: {response.status_code}")
        if response.status_code == 200:
            print(f"   Response: {response.json()}")
        return True
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

def test_protected_route():
    """Prueba que una ruta protegida rechace acceso sin auth"""
    try:
        response = requests.get(f"{API_V1}/rag/rag-status", timeout=5)
        if response.status_code in [401, 403]:
            print(f"✅ Ruta protegida correctamente rechazada: {response.status_code}")
            return True
        else:
            print(f"❌ Ruta protegida no rechazó acceso: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error probando ruta protegida: {e}")
        return False

def test_auth_login():
    """Prueba el endpoint de login"""
    try:
        login_data = {"username": "admin", "password": "admin123"}
        response = requests.post(f"{API_V1}/auth/login", json=login_data, timeout=5)
        
        if response.status_code == 200:
            token_data = response.json()
            access_token = token_data.get("access_token")
            print(f"✅ Login exitoso, token: {access_token[:20]}...")
            return access_token
        else:
            print(f"❌ Login falló: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error en login: {e}")
        return None

def test_with_token(token):
    """Prueba acceso a ruta protegida con token"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{API_V1}/rag/rag-status", headers=headers, timeout=5)
        
        if response.status_code == 200:
            print(f"✅ Acceso con token exitoso: {response.status_code}")
            return True
        else:
            print(f"❌ Acceso con token falló: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error con token: {e}")
        return False

def main():
    print("🚀 PRUEBAS RÁPIDAS DEL MIDDLEWARE")
    print("=" * 40)
    
    # Test 1: Conectividad básica
    if not test_health():
        print("❌ Servidor no disponible, saliendo...")
        return
    
    # Test 2: Ruta protegida sin auth
    test_protected_route()
    
    # Test 3: Login
    token = test_auth_login()
    
    # Test 4: Acceso con token
    if token:
        test_with_token(token)
    
    print("\n🏁 Pruebas completadas")

if __name__ == "__main__":
    main()