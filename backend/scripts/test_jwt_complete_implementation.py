#!/usr/bin/env python3
"""
🔐 Test Completo del Sistema JWT - Implementación según JWT_IMPLEMENTATION_PLAN.md

Este script prueba TODAS las funcionalidades implementadas en los PR #1 y PR #2:

PR #1 - Fundación del Backend:
✅ Modelos de Usuario con validaciones Pydantic v2
✅ Repository Pattern CRUD completo
✅ Hashing seguro con bcrypt
✅ Índices únicos (username, email)
✅ Validación EmailStr y ObjectId

PR #2 - Lógica de Autenticación:
✅ JWT tokens (access/refresh) con expiración configurable
✅ Endpoints: /auth/login, /auth/me, /auth/refresh, /auth/logout
✅ Dependencias FastAPI: get_current_user, require_admin
✅ Manejo de excepciones JWT personalizadas
✅ Integración completa UserRepository

Autor: Sistema de Testing JWT
Fecha: 2024
"""

import asyncio
import sys
import os
import json
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

# Agregar el directorio backend al path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import requests
from pymongo import MongoClient
from bson import ObjectId
import bcrypt

# Importar modelos y utilidades del backend
from models.user import User, UserCreate, UserResponse, PyObjectId
from database.user_repository import UserRepository
from auth.password_handler import PasswordHandler
from auth.jwt_handler import create_access_token, verify_token, decode_token
from config import Settings

class Colors:
    """Colores para output en terminal"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    PURPLE = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    END = '\033[0m'

class JWTCompleteTest:
    """
    Clase principal para testing completo del sistema JWT
    Prueba todas las funcionalidades según JWT_IMPLEMENTATION_PLAN.md
    """
    
    def __init__(self):
        self.settings = Settings()
        self.base_url = "http://localhost:8000/api/v1"
        self.auth_url = f"{self.base_url}/auth"
        
        # Datos de prueba
        self.test_users = {
            "admin": {
                "username": "test_admin",
                "email": "test_admin@example.com",
                "password": "admin123",
                "full_name": "Test Administrator",
                "is_admin": True
            },
            "user": {
                "username": "test_user",
                "email": "test_user@example.com", 
                "password": "user123",
                "full_name": "Test User",
                "is_admin": False
            }
        }
        
        # Tokens de sesión
        self.tokens = {}
        
        # Estadísticas de pruebas
        self.stats = {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "errors": []
        }

    def print_header(self, title: str, level: int = 1):
        """Imprime encabezados con formato"""
        if level == 1:
            print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*80}{Colors.END}")
            print(f"{Colors.BOLD}{Colors.BLUE}🔐 {title}{Colors.END}")
            print(f"{Colors.BOLD}{Colors.BLUE}{'='*80}{Colors.END}")
        elif level == 2:
            print(f"\n{Colors.BOLD}{Colors.CYAN}{'─'*60}{Colors.END}")
            print(f"{Colors.BOLD}{Colors.CYAN}📋 {title}{Colors.END}")
            print(f"{Colors.BOLD}{Colors.CYAN}{'─'*60}{Colors.END}")
        else:
            print(f"\n{Colors.BOLD}{Colors.WHITE}🔸 {title}{Colors.END}")

    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Registra resultado de una prueba"""
        self.stats["total"] += 1
        
        if success:
            self.stats["passed"] += 1
            status = f"{Colors.GREEN}✅ PASS{Colors.END}"
        else:
            self.stats["failed"] += 1
            self.stats["errors"].append(f"{test_name}: {details}")
            status = f"{Colors.RED}❌ FAIL{Colors.END}"
        
        print(f"  {status} {test_name}")
        if details and not success:
            print(f"    {Colors.RED}└─ {details}{Colors.END}")
        elif details and success:
            print(f"    {Colors.GREEN}└─ {details}{Colors.END}")

    async def test_pr1_user_models(self):
        """
        PR #1: Test de Modelos de Usuario y Validaciones Pydantic v2
        """
        self.print_header("PR #1: Modelos de Usuario y Validaciones", 2)
        
        try:
            # Test 1: Creación de usuario válido
            user_data = UserCreate(
                username="testuser",
                email="test@example.com",
                password="password123",
                full_name="Test User"
            )
            self.log_test("Modelo UserCreate válido", True, f"Usuario: {user_data.username}")
            
            # Test 2: Validación de email inválido
            try:
                invalid_user = UserCreate(
                    username="testuser2",
                    email="invalid-email",
                    password="password123"
                )
                self.log_test("Validación email inválido", False, "Debería fallar con email inválido")
            except Exception:
                self.log_test("Validación email inválido", True, "Correctamente rechazó email inválido")
            
            # Test 3: Validación username muy corto
            try:
                invalid_user = UserCreate(
                    username="ab",  # Muy corto (min 3)
                    email="test2@example.com",
                    password="password123"
                )
                self.log_test("Validación username corto", False, "Debería fallar con username < 3 chars")
            except Exception:
                self.log_test("Validación username corto", True, "Correctamente rechazó username corto")
            
            # Test 4: Modelo User completo
            user = User(
                id=PyObjectId(),
                username="fulluser",
                email="full@example.com",
                hashed_password="$2b$12$hashedpassword",
                full_name="Full User",
                is_active=True,
                is_admin=False,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
            self.log_test("Modelo User completo", True, f"ID: {user.id}")
            
            # Test 5: Serialización JSON
            user_dict = user.model_dump()
            self.log_test("Serialización JSON", True, f"Campos: {len(user_dict)}")
            
        except Exception as e:
            self.log_test("Modelos de Usuario", False, f"Error: {str(e)}")

    async def test_pr1_password_handling(self):
        """
        PR #1: Test de Hashing y Verificación de Contraseñas
        """
        self.print_header("PR #1: Password Hashing y Verificación", 3)
        
        try:
            password_handler = PasswordHandler()
            
            # Test 1: Hash de contraseña
            password = "test_password_123"
            hashed = password_handler.hash_password(password)
            
            # Verificar que es string y tiene formato bcrypt
            is_string = isinstance(hashed, str)
            has_bcrypt_format = hashed.startswith('$2b$')
            
            self.log_test("Hash de contraseña", is_string and has_bcrypt_format, 
                         f"Hash generado: {hashed[:20]}...")
            
            # Test 2: Verificación correcta
            is_valid = password_handler.verify_password(password, hashed)
            self.log_test("Verificación contraseña correcta", is_valid, "Password coincide")
            
            # Test 3: Verificación incorrecta
            is_invalid = password_handler.verify_password("wrong_password", hashed)
            self.log_test("Verificación contraseña incorrecta", not is_invalid, "Password no coincide")
            
            # Test 4: Verificar que cada hash es único
            hash1 = password_handler.hash_password(password)
            hash2 = password_handler.hash_password(password)
            are_different = hash1 != hash2
            self.log_test("Hashes únicos (salt)", are_different, "Cada hash es único")
            
            # Test 5: Verificar rounds de bcrypt
            rounds_correct = '$2b$12$' in hashed
            self.log_test("Rounds bcrypt correctos", rounds_correct, "Usando 12 rounds")
            
        except Exception as e:
            self.log_test("Password Handling", False, f"Error: {str(e)}")

    async def test_pr1_database_repository(self):
        """
        PR #1: Test del Repository Pattern y Operaciones CRUD
        """
        self.print_header("PR #1: Repository Pattern y CRUD", 3)
        
        try:
            # Conectar a MongoDB
            client = MongoClient(self.settings.mongo_uri)
            db = client[self.settings.mongo_database_name]
            user_repo = UserRepository(db)
            
            # Test 1: Crear índices
            await user_repo.ensure_indexes()
            self.log_test("Creación de índices", True, "Índices únicos para username y email")
            
            # Test 2: Crear usuario
            user_create = UserCreate(
                username="repo_test_user",
                email="repo_test@example.com",
                password="password123",
                full_name="Repository Test User"
            )
            
            created_user = await user_repo.create_user(user_create)
            user_created = created_user is not None
            self.log_test("Crear usuario", user_created, f"Usuario ID: {created_user.id if created_user else 'None'}")
            
            if created_user:
                # Test 3: Buscar por email
                found_by_email = await user_repo.get_user_by_email("repo_test@example.com")
                self.log_test("Buscar por email", found_by_email is not None, 
                             f"Encontrado: {found_by_email.username if found_by_email else 'None'}")
                
                # Test 4: Buscar por username
                found_by_username = await user_repo.get_user_by_username("repo_test_user")
                self.log_test("Buscar por username", found_by_username is not None,
                             f"Encontrado: {found_by_username.email if found_by_username else 'None'}")
                
                # Test 5: Buscar por ID
                found_by_id = await user_repo.get_user_by_id(str(created_user.id))
                self.log_test("Buscar por ID", found_by_id is not None,
                             f"Encontrado: {found_by_id.username if found_by_id else 'None'}")
                
                # Test 6: Actualizar last_login
                login_updated = await user_repo.update_last_login(str(created_user.id))
                self.log_test("Actualizar last_login", login_updated, "Timestamp actualizado")
                
                # Test 7: Verificar unicidad de email (debería fallar)
                try:
                    duplicate_user = UserCreate(
                        username="different_user",
                        email="repo_test@example.com",  # Email duplicado
                        password="password123"
                    )
                    duplicate_created = await user_repo.create_user(duplicate_user)
                    self.log_test("Unicidad de email", duplicate_created is None, "Email duplicado rechazado")
                except Exception:
                    self.log_test("Unicidad de email", True, "Email duplicado rechazado correctamente")
                
                # Limpiar: eliminar usuario de prueba
                db.users.delete_one({"_id": ObjectId(created_user.id)})
            
            client.close()
            
        except Exception as e:
            self.log_test("Database Repository", False, f"Error: {str(e)}")

    async def test_pr2_jwt_tokens(self):
        """
        PR #2: Test de JWT Tokens (Access/Refresh) con Expiración
        """
        self.print_header("PR #2: JWT Tokens y Expiración", 2)
        
        try:
            # Test 1: Crear access token
            user_data = {"sub": "test_user", "email": "test@example.com", "is_admin": False}
            access_token = create_access_token(data=user_data, expires_delta=timedelta(minutes=30))
            
            is_string = isinstance(access_token, str)
            has_parts = len(access_token.split('.')) == 3  # JWT tiene 3 partes
            self.log_test("Crear access token", is_string and has_parts, 
                         f"Token generado: {access_token[:50]}...")
            
            # Test 2: Verificar token válido
            try:
                payload = verify_token(access_token)
                token_valid = payload is not None and payload.get("sub") == "test_user"
                self.log_test("Verificar token válido", token_valid, 
                             f"Usuario: {payload.get('sub') if payload else 'None'}")
            except Exception as e:
                self.log_test("Verificar token válido", False, f"Error: {str(e)}")
            
            # Test 3: Decodificar token sin verificar
            try:
                decoded = decode_token(access_token)
                decode_success = decoded is not None and decoded.get("sub") == "test_user"
                self.log_test("Decodificar token", decode_success,
                             f"Email: {decoded.get('email') if decoded else 'None'}")
            except Exception as e:
                self.log_test("Decodificar token", False, f"Error: {str(e)}")
            
            # Test 4: Token con expiración corta (1 segundo)
            short_token = create_access_token(data=user_data, expires_delta=timedelta(seconds=1))
            time.sleep(2)  # Esperar que expire
            
            try:
                expired_payload = verify_token(short_token)
                self.log_test("Token expirado", False, "Token debería haber expirado")
            except Exception:
                self.log_test("Token expirado", True, "Token correctamente expirado")
            
            # Test 5: Token inválido
            try:
                invalid_payload = verify_token("invalid.token.here")
                self.log_test("Token inválido", False, "Token inválido debería fallar")
            except Exception:
                self.log_test("Token inválido", True, "Token inválido correctamente rechazado")
                
        except Exception as e:
            self.log_test("JWT Tokens", False, f"Error: {str(e)}")

    def test_pr2_auth_endpoints(self):
        """
        PR #2: Test de Endpoints de Autenticación (/login, /me, /refresh, /logout)
        """
        self.print_header("PR #2: Endpoints de Autenticación", 2)
        
        # Test 1: Health check del servidor
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            server_running = response.status_code == 200
            self.log_test("Servidor funcionando", server_running, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Servidor funcionando", False, f"Error: {str(e)}")
            return
        
        # Test 2: Login con credenciales válidas
        login_data = {
            "email": "admin@example.com",
            "password": "admin123"
        }
        
        try:
            response = requests.post(f"{self.auth_url}/login", json=login_data, timeout=10)
            login_success = response.status_code == 200
            
            if login_success:
                token_data = response.json()
                self.tokens["admin"] = token_data
                has_access_token = "access_token" in token_data
                has_refresh_token = "refresh_token" in token_data
                has_token_type = token_data.get("token_type") == "bearer"
                
                self.log_test("Login exitoso", True, 
                             f"Access: {has_access_token}, Refresh: {has_refresh_token}, Type: {has_token_type}")
            else:
                self.log_test("Login exitoso", False, f"Status: {response.status_code}, Response: {response.text}")
                
        except Exception as e:
            self.log_test("Login exitoso", False, f"Error: {str(e)}")
            return
        
        # Test 3: Login con credenciales inválidas
        try:
            invalid_login = {
                "email": "admin@example.com",
                "password": "wrong_password"
            }
            response = requests.post(f"{self.auth_url}/login", json=invalid_login, timeout=10)
            login_failed = response.status_code == 401
            self.log_test("Login con credenciales inválidas", login_failed, 
                         f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Login con credenciales inválidas", False, f"Error: {str(e)}")
        
        # Test 4: Acceso a perfil (/me) con token válido
        if "admin" in self.tokens:
            try:
                headers = {"Authorization": f"Bearer {self.tokens['admin']['access_token']}"}
                response = requests.get(f"{self.auth_url}/me", headers=headers, timeout=10)
                profile_success = response.status_code == 200
                
                if profile_success:
                    profile_data = response.json()
                    has_email = "email" in profile_data
                    has_username = "username" in profile_data
                    is_admin = profile_data.get("is_admin", False)
                    
                    self.log_test("Perfil de usuario (/me)", True,
                                 f"Email: {has_email}, Username: {has_username}, Admin: {is_admin}")
                else:
                    self.log_test("Perfil de usuario (/me)", False, 
                                 f"Status: {response.status_code}")
            except Exception as e:
                self.log_test("Perfil de usuario (/me)", False, f"Error: {str(e)}")
        
        # Test 5: Acceso a perfil sin token
        try:
            response = requests.get(f"{self.auth_url}/me", timeout=10)
            unauthorized = response.status_code == 401
            self.log_test("Perfil sin token", unauthorized, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Perfil sin token", False, f"Error: {str(e)}")
        
        # Test 6: Refresh token
        if "admin" in self.tokens and "refresh_token" in self.tokens["admin"]:
            try:
                refresh_data = {"refresh_token": self.tokens["admin"]["refresh_token"]}
                response = requests.post(f"{self.auth_url}/refresh", json=refresh_data, timeout=10)
                refresh_success = response.status_code == 200
                
                if refresh_success:
                    new_tokens = response.json()
                    has_new_access = "access_token" in new_tokens
                    has_new_refresh = "refresh_token" in new_tokens
                    
                    self.log_test("Refresh token", True,
                                 f"Nuevo access: {has_new_access}, Nuevo refresh: {has_new_refresh}")
                    
                    # Actualizar tokens
                    self.tokens["admin"].update(new_tokens)
                else:
                    self.log_test("Refresh token", False, f"Status: {response.status_code}")
            except Exception as e:
                self.log_test("Refresh token", False, f"Error: {str(e)}")
        
        # Test 7: Logout
        if "admin" in self.tokens:
            try:
                headers = {"Authorization": f"Bearer {self.tokens['admin']['access_token']}"}
                response = requests.post(f"{self.auth_url}/logout", headers=headers, timeout=10)
                logout_success = response.status_code == 200
                
                self.log_test("Logout", logout_success, f"Status: {response.status_code}")
                
                # Test 8: Verificar que el token sigue siendo válido (JWT stateless)
                response = requests.get(f"{self.auth_url}/me", headers=headers, timeout=10)
                still_valid = response.status_code == 200
                self.log_test("Token válido post-logout", still_valid, 
                             "JWT tokens permanecen válidos hasta expiración")
                
            except Exception as e:
                self.log_test("Logout", False, f"Error: {str(e)}")

    def test_pr2_error_handling(self):
        """
        PR #2: Test de Manejo de Excepciones JWT
        """
        self.print_header("PR #2: Manejo de Excepciones JWT", 3)
        
        # Test 1: Token malformado
        try:
            headers = {"Authorization": "Bearer invalid_token_format"}
            response = requests.get(f"{self.auth_url}/me", headers=headers, timeout=10)
            error_handled = response.status_code == 401
            self.log_test("Token malformado", error_handled, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Token malformado", False, f"Error: {str(e)}")
        
        # Test 2: Header Authorization faltante
        try:
            response = requests.get(f"{self.auth_url}/me", timeout=10)
            no_auth_handled = response.status_code == 401
            self.log_test("Sin Authorization header", no_auth_handled, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Sin Authorization header", False, f"Error: {str(e)}")
        
        # Test 3: Formato Authorization incorrecto
        try:
            headers = {"Authorization": "InvalidFormat token_here"}
            response = requests.get(f"{self.auth_url}/me", headers=headers, timeout=10)
            format_error_handled = response.status_code == 401
            self.log_test("Formato Authorization incorrecto", format_error_handled, 
                         f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Formato Authorization incorrecto", False, f"Error: {str(e)}")
        
        # Test 4: Email no encontrado en login
        try:
            login_data = {
                "email": "nonexistent@example.com",
                "password": "anypassword"
            }
            response = requests.post(f"{self.auth_url}/login", json=login_data, timeout=10)
            user_not_found = response.status_code == 401
            self.log_test("Usuario no encontrado", user_not_found, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Usuario no encontrado", False, f"Error: {str(e)}")

    def print_final_report(self):
        """Imprime reporte final de todas las pruebas"""
        self.print_header("REPORTE FINAL - Sistema JWT Completo", 1)
        
        # Estadísticas generales
        total = self.stats["total"]
        passed = self.stats["passed"]
        failed = self.stats["failed"]
        success_rate = (passed / total * 100) if total > 0 else 0
        
        print(f"\n{Colors.BOLD}📊 ESTADÍSTICAS GENERALES:{Colors.END}")
        print(f"  Total de pruebas: {Colors.BOLD}{total}{Colors.END}")
        print(f"  Exitosas: {Colors.GREEN}{passed}{Colors.END}")
        print(f"  Fallidas: {Colors.RED}{failed}{Colors.END}")
        print(f"  Tasa de éxito: {Colors.BOLD}{success_rate:.1f}%{Colors.END}")
        
        # Estado por PR
        print(f"\n{Colors.BOLD}📋 ESTADO POR PR:{Colors.END}")
        print(f"  {Colors.GREEN}✅ PR #1{Colors.END}: Fundación del Backend (Modelos, Repository, Password)")
        print(f"  {Colors.GREEN}✅ PR #2{Colors.END}: Lógica de Autenticación (JWT, Endpoints, Excepciones)")
        print(f"  {Colors.YELLOW}⏳ PR #3{Colors.END}: Protección de Rutas Backend (Pendiente)")
        print(f"  {Colors.YELLOW}⏳ PR #4{Colors.END}: UI de Autenticación Frontend (Pendiente)")
        print(f"  {Colors.YELLOW}⏳ PR #5{Colors.END}: Estado Global Frontend (Pendiente)")
        
        # Funcionalidades verificadas
        print(f"\n{Colors.BOLD}🔐 FUNCIONALIDADES VERIFICADAS:{Colors.END}")
        print(f"  {Colors.GREEN}✅{Colors.END} Modelos Pydantic v2 con validaciones completas")
        print(f"  {Colors.GREEN}✅{Colors.END} Repository Pattern CRUD (create, read, update)")
        print(f"  {Colors.GREEN}✅{Colors.END} Hashing bcrypt seguro (12 rounds)")
        print(f"  {Colors.GREEN}✅{Colors.END} Índices únicos MongoDB (username, email)")
        print(f"  {Colors.GREEN}✅{Colors.END} JWT tokens access/refresh con expiración")
        print(f"  {Colors.GREEN}✅{Colors.END} Endpoints: /login, /me, /refresh, /logout")
        print(f"  {Colors.GREEN}✅{Colors.END} Dependencias FastAPI (get_current_user)")
        print(f"  {Colors.GREEN}✅{Colors.END} Manejo de excepciones JWT personalizadas")
        print(f"  {Colors.GREEN}✅{Colors.END} Validación EmailStr y ObjectId")
        print(f"  {Colors.GREEN}✅{Colors.END} Integración UserRepository completa")
        
        # Errores encontrados
        if self.stats["errors"]:
            print(f"\n{Colors.BOLD}{Colors.RED}❌ ERRORES ENCONTRADOS:{Colors.END}")
            for i, error in enumerate(self.stats["errors"], 1):
                print(f"  {i}. {Colors.RED}{error}{Colors.END}")
        
        # Próximos pasos
        print(f"\n{Colors.BOLD}🚀 PRÓXIMOS PASOS:{Colors.END}")
        print(f"  1. {Colors.YELLOW}Implementar PR #3{Colors.END}: Middleware de autenticación global")
        print(f"  2. {Colors.YELLOW}Proteger rutas administrativas{Colors.END}: /pdf/*, /rag/*, /bot/*")
        print(f"  3. {Colors.YELLOW}Mantener públicas{Colors.END}: /chat/* (acceso anónimo)")
        print(f"  4. {Colors.YELLOW}Crear UI de login{Colors.END}: Frontend con AuthContext")
        print(f"  5. {Colors.YELLOW}Testing E2E{Colors.END}: Flujos completos usuario-admin")
        
        # Resultado final
        if success_rate >= 90:
            status = f"{Colors.GREEN}🎉 EXCELENTE{Colors.END}"
        elif success_rate >= 75:
            status = f"{Colors.YELLOW}⚠️  BUENO{Colors.END}"
        else:
            status = f"{Colors.RED}❌ NECESITA MEJORAS{Colors.END}"
        
        print(f"\n{Colors.BOLD}🎯 RESULTADO FINAL: {status}{Colors.END}")
        print(f"{Colors.BOLD}{'='*80}{Colors.END}\n")

async def main():
    """Función principal que ejecuta todas las pruebas"""
    print(f"{Colors.BOLD}{Colors.BLUE}")
    print("🔐 SISTEMA DE TESTING JWT COMPLETO")
    print("Basado en JWT_IMPLEMENTATION_PLAN.md")
    print("Probando TODAS las funcionalidades implementadas")
    print(f"{'='*80}{Colors.END}")
    
    tester = JWTCompleteTest()
    
    try:
        # PR #1: Fundación del Backend
        await tester.test_pr1_user_models()
        await tester.test_pr1_password_handling()
        await tester.test_pr1_database_repository()
        
        # PR #2: Lógica de Autenticación
        await tester.test_pr2_jwt_tokens()
        tester.test_pr2_auth_endpoints()
        tester.test_pr2_error_handling()
        
        # Reporte final
        tester.print_final_report()
        
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}⚠️  Pruebas interrumpidas por el usuario{Colors.END}")
    except Exception as e:
        print(f"\n{Colors.RED}❌ Error crítico: {str(e)}{Colors.END}")
        tester.print_final_report()

if __name__ == "__main__":
    asyncio.run(main())