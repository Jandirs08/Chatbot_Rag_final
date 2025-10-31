# 🔐 Plan de Implementación JWT - Sistema de Autenticación para Admin

## 🎯 Contexto Clave del Sistema

**⚠️ IMPORTANTE**: Este sistema JWT está diseñado exclusivamente para:
- **Admin Login**: Autenticación del administrador para acceder a páginas de gestión
- **Rutas Protegidas**: `/Documents`, `/widget` (constructor), `/admin`, `/dashboard`, etc.
- **Chat Público**: La ruta `/chat` y endpoints `/api/v1/chat/*` permanecen **100% públicos y anónimos**

## 📋 Análisis de Arquitectura Actual

### Backend (FastAPI)
- **Estructura principal**: `main.py` → `api/app.py` (create_app)
- **Configuración**: `config.py` con Settings usando Pydantic v2
- **Rutas existentes**: Organizadas en `api/routes/` por módulos (chat, pdf, rag, health, bot)
- **Esquemas**: `api/schemas.py` (actualmente mínimo)
- **Base de datos**: MongoDB con `database/mongodb.py` (MongodbClient)
- **Colecciones actuales**: `messages` para historial de chat

### Frontend (Next.js 14)
- **Estructura**: App Router con `app/` directory
- **Páginas existentes**: Dashboard (`/`), Chat (`/chat`), Documents (`/Documents`), Widget (`/widget`)
- **Componentes**: UI components en `app/components/ui/` (shadcn/ui)
- **Servicios**: `app/lib/services/` para comunicación con API
- **Estado**: Sin gestión global de estado (oportunidad para AuthContext)

### Base de Datos (MongoDB)
- **Cliente**: `MongodbClient` con Motor (async)
- **Colección actual**: `messages` con índices optimizados
- **Estructura de mensaje**: `conversation_id`, `role`, `content`, `timestamp`

---

## 🚀 Plan de Implementación por Pull Requests

### PR #1: Fundación del Backend - Modelos de Usuario y Base de Datos
**Objetivo**: Establecer la base de datos y modelos para usuarios

#### Archivos a Modificar/Crear:

**1. `backend/models/user.py` (NUEVO)**
```python
# Modelo Pydantic para usuarios con validaciones
class User(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    hashed_password: str
    full_name: Optional[str] = None
    is_active: bool = True
    is_admin: bool = False
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    full_name: Optional[str]
    is_active: bool
    is_admin: bool
    created_at: datetime
    last_login: Optional[datetime]
```

**2. `backend/database/mongodb.py` (MODIFICAR)**
- Agregar método `get_user_collection()` 
- Agregar métodos CRUD para usuarios:
  - `create_user(user_data: dict)`
  - `get_user_by_username(username: str)`
  - `get_user_by_email(email: str)`
  - `update_user_last_login(user_id: str)`
- Agregar índices para usuarios en `ensure_indexes()`

**3. `backend/config.py` (MODIFICAR)**
- Agregar configuraciones JWT ya preparadas:
  - `jwt_access_token_expire_minutes: int = 30`
  - Verificar que `jwt_secret` y `jwt_algorithm` estén configurados

**4. `backend/.env.example` (MODIFICAR)**
- Agregar variables JWT faltantes:
  - `JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30`
  - `JWT_REFRESH_TOKEN_EXPIRE_DAYS=7`

#### Criterios de Aceptación:
- [ ] Modelo User creado con validaciones Pydantic
- [ ] Base de datos MongoDB preparada para usuarios
- [ ] Índices de usuario creados (username, email únicos)
- [ ] Configuración JWT completada

---

### PR #2: Lógica de Autenticación del Backend - JWT y Endpoints
**Objetivo**: Implementar utilidades JWT y endpoints de autenticación

#### Archivos a Crear:

**1. `backend/auth/__init__.py` (NUEVO)**

**2. `backend/auth/jwt_handler.py` (NUEVO)**
```python
# Utilidades para JWT: crear, verificar, decodificar tokens
# Funciones: create_access_token, verify_token, decode_token
# Manejo de excepciones JWT personalizadas
```

**3. `backend/auth/password_handler.py` (NUEVO)**
```python
# Utilidades para contraseñas: hash, verificar
# Usar bcrypt para hashing seguro
```

**4. `backend/auth/dependencies.py` (NUEVO)**
```python
# Dependencias FastAPI para autenticación
# get_current_user, get_current_active_user, require_admin
```

**5. `backend/api/routes/auth/__init__.py` (NUEVO)**

**6. `backend/api/routes/auth/auth_routes.py` (NUEVO)**
```python
# Endpoints:
# POST /auth/register - Registro de usuarios
# POST /auth/login - Login con JWT
# POST /auth/refresh - Renovar token
# GET /auth/me - Obtener usuario actual
# POST /auth/logout - Logout (opcional, blacklist)
```

#### Archivos a Modificar:

**7. `backend/api/app.py` (MODIFICAR)**
- Registrar router de autenticación en `create_app()`
- Agregar middleware de autenticación si es necesario

**8. `backend/api/schemas.py` (MODIFICAR)**
- Importar y re-exportar esquemas de usuario desde `models/user.py`
- Agregar esquemas de respuesta JWT:
  ```python
  class Token(BaseModel):
      access_token: str
      token_type: str = "bearer"
      expires_in: int
  ```

#### Criterios de Aceptación:
- [ ] JWT tokens se crean y verifican correctamente
- [ ] Endpoint `/auth/register` funcional
- [ ] Endpoint `/auth/login` retorna JWT válido
- [ ] Endpoint `/auth/me` protegido funciona
- [ ] Contraseñas hasheadas con bcrypt
- [ ] Manejo de errores JWT apropiado

---

### PR #3: Seguridad del Backend - Protección de Rutas de Administración
**Objetivo**: Proteger únicamente los endpoints de administración con autenticación JWT

#### Archivos a Modificar:

**1. `backend/api/routes/pdf/pdf_routes.py` (MODIFICAR)**
- Proteger endpoints de subida/eliminación de PDFs (solo admin)
- Usar `require_admin` dependency

**2. `backend/api/routes/bot/bot_routes.py` (MODIFICAR)**
- Proteger configuración del bot (solo admin)
- Usar `require_admin` dependency

**3. `backend/api/routes/rag/rag_routes.py` (MODIFICAR)**
- Proteger endpoints de gestión RAG (solo admin)

**4. ⚠️ `backend/api/routes/chat/chat_routes.py` (NO MODIFICAR)**
- **MANTENER PÚBLICO**: Los endpoints de chat permanecen sin autenticación
- **NO agregar** dependencias de autenticación
- El chat widget debe funcionar de forma anónima

#### Rutas a Proteger:
- **Públicas**: `/health`, `/auth/*`, **`/chat/*`** ⭐
- **Solo Admin**: `/pdf/*`, `/bot/*`, `/rag/*`, `/stats`, `/export`

#### Criterios de Aceptación:
- [ ] Solo rutas de administración requieren autenticación
- [ ] **Chat endpoints permanecen públicos y anónimos**
- [ ] Admins tienen acceso completo a gestión
- [ ] Mensajes de error apropiados para endpoints protegidos

---

### PR #4: UI de Autenticación del Frontend - Páginas Login/Register
**Objetivo**: Crear interfaz de usuario para autenticación

#### Archivos a Crear:

**1. `frontend/app/auth/login/page.tsx` (NUEVO)**
```tsx
// Página de login con formulario
// Usar componentes UI existentes (Card, Input, Button)
// Integración con AuthContext
// Redirección post-login
```

**2. `frontend/app/auth/register/page.tsx` (NUEVO)**
```tsx
// Página de registro con validaciones
// Formulario completo (username, email, password, confirm)
// Validaciones client-side
```

**3. `frontend/app/auth/layout.tsx` (NUEVO)**
```tsx
// Layout específico para páginas de auth
// Centrado, sin sidebar, diseño limpio
```

**4. `frontend/app/lib/services/authService.ts` (NUEVO)**
```typescript
// Servicio para comunicación con API de auth
// login, register, logout, getCurrentUser, refreshToken
// Manejo de tokens en localStorage/cookies
```

**5. `frontend/app/components/auth/LoginForm.tsx` (NUEVO)**
**6. `frontend/app/components/auth/RegisterForm.tsx` (NUEVO)**
**7. `frontend/app/components/auth/AuthGuard.tsx` (NUEVO)**

#### Archivos a Modificar:

**8. `frontend/app/lib/config.ts` (MODIFICAR)**
- Agregar endpoints de autenticación
- Configuración de tokens

#### Criterios de Aceptación:
- [ ] Página `/auth/login` funcional y responsive
- [ ] Página `/auth/register` con validaciones
- [ ] Formularios usan componentes UI existentes
- [ ] Integración con API de autenticación
- [ ] Manejo de errores de formulario
- [ ] Diseño consistente con la app

---

### PR #5: Gestión de Estado del Frontend - AuthContext y Hooks
**Objetivo**: Implementar gestión global del estado de autenticación

#### Archivos a Crear:

**1. `frontend/app/contexts/AuthContext.tsx` (NUEVO)**
```tsx
// Context para estado global de autenticación
// Estados: user, isLoading, isAuthenticated
// Funciones: login, logout, register, refreshToken
// Persistencia de sesión
```

**2. `frontend/app/hooks/useAuth.ts` (NUEVO)**
```tsx
// Hook personalizado para usar AuthContext
// Simplifica el acceso al contexto de auth
```

**3. `frontend/app/hooks/useAuthGuard.ts` (NUEVO)**
```tsx
// Hook para protección de rutas
// Redirección automática si no autenticado
```

#### Archivos a Modificar:

**4. `frontend/app/layout.tsx` (MODIFICAR)**
- Envolver children con AuthProvider
- Mantener estructura existente con RootLayoutClient

**5. `frontend/app/components/RootLayoutClient.tsx` (MODIFICAR)**
- Integrar AuthContext
- Mostrar/ocultar sidebar basado en autenticación

**6. Servicios existentes (MODIFICAR)**
- `frontend/app/lib/services/botService.ts`
- `frontend/app/lib/services/pdfService.ts`
- `frontend/app/lib/services/statsService.ts`
- Agregar headers de autorización automáticamente

#### Criterios de Aceptación:
- [ ] AuthContext funcional en toda la app
- [ ] Estado de autenticación persistente
- [ ] Tokens se renuevan automáticamente
- [ ] Logout limpia estado correctamente
- [ ] Servicios incluyen auth headers automáticamente

---

### PR #6: Protección de Rutas del Frontend - Middleware y Guards para Admin
**Objetivo**: Implementar protección de rutas administrativas en el frontend

#### Archivos a Crear:

**1. `frontend/middleware.ts` (NUEVO)**
```typescript
// Middleware de Next.js para protección de rutas administrativas
// Verificar JWT en cookies/headers
// Redirecciones automáticas
// Solo proteger rutas de admin, mantener /chat público
```

**2. `frontend/app/components/ProtectedRoute.tsx` (NUEVO)**
```tsx
// Componente wrapper para rutas administrativas protegidas
// Alternativa/complemento al middleware
```

#### Archivos a Modificar:

**3. `frontend/app/page.tsx` (MODIFICAR - Dashboard)**
- Agregar protección con useAuthGuard (solo admin)
- Mostrar panel de administración

**4. ⚠️ `frontend/app/chat/page.tsx` (NO MODIFICAR)**
- **MANTENER PÚBLICO**: La página de chat permanece accesible sin login
- **NO agregar** protección de autenticación
- El widget debe funcionar de forma anónima

**5. `frontend/app/Documents/page.tsx` (MODIFICAR)**
- Proteger gestión de documentos (solo admin)

**6. `frontend/app/widget/page.tsx` (MODIFICAR)**
- Proteger constructor de widget (solo admin)

**7. `frontend/app/components/AppSidebar.tsx` (MODIFICAR)**
- Mostrar información del admin logueado
- Botón de logout
- Ocultar opciones según autenticación

#### Configuración de Rutas:
```typescript
// Rutas públicas (sin autenticación)
const publicRoutes = ['/auth/login', '/auth/register', '/chat'] // ⭐ /chat público

// Rutas protegidas (requieren login de admin)
const adminRoutes = ['/dashboard', '/Documents', '/widget', '/admin']
```

#### Criterios de Aceptación:
- [ ] Middleware protege solo rutas administrativas
- [ ] **Ruta /chat permanece completamente pública**
- [ ] Redirección a login si admin no autenticado
- [ ] Redirección a dashboard después del login de admin
- [ ] Sidebar muestra estado de autenticación del admin
- [ ] Logout funciona desde cualquier página administrativa
- [ ] Widget de chat funciona sin restricciones

---

## 🔧 Configuración Adicional Requerida

### Variables de Entorno (.env)
```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-min-32-chars
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# MongoDB (ya configurado)
MONGO_URI=mongodb://localhost:27017/chatbot_rag_db
MONGO_DATABASE_NAME=chatbot_rag_db
```

### Dependencias Adicionales

#### Backend (requirements.txt)
```
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.6
```

#### Frontend (package.json)
```json
{
  "dependencies": {
    "js-cookie": "^3.0.5",
    "jwt-decode": "^4.0.0"
  },
  "devDependencies": {
    "@types/js-cookie": "^3.0.6"
  }
}
```

---

## 🧪 Plan de Testing

### Por cada PR:
1. **Tests unitarios** para nuevas funciones
2. **Tests de integración** para endpoints
3. **Tests E2E** para flujos completos
4. **Verificación manual** de UI/UX

### Casos de Prueba Críticos:
- [ ] Registro de usuario exitoso
- [ ] Login con credenciales válidas/inválidas
- [ ] Acceso a rutas protegidas sin token
- [ ] Renovación automática de tokens
- [ ] Logout y limpieza de sesión
- [ ] Protección de datos entre usuarios

---

## 📈 Consideraciones de Seguridad

### Implementadas:
- ✅ Hashing de contraseñas con bcrypt
- ✅ JWT con expiración configurable
- ✅ Validación de entrada con Pydantic
- ✅ Separación de rutas públicas/privadas/admin

### Recomendaciones Futuras:
- 🔄 Rate limiting en endpoints de auth
- 🔄 Blacklist de tokens JWT
- 🔄 2FA (Two-Factor Authentication)
- 🔄 Logs de seguridad y auditoría
- 🔄 HTTPS en producción
- 🔄 Rotación de secrets JWT

---

## 🚀 Orden de Implementación Recomendado

1. **PR #1** → Fundación sólida de datos
2. **PR #2** → Core de autenticación backend
3. **PR #3** → Seguridad de endpoints existentes
4. **PR #4** → Interfaz de usuario básica
5. **PR #5** → Estado global y persistencia
6. **PR #6** → Protección completa del frontend

**Tiempo estimado**: 2-3 semanas (1 PR cada 2-3 días)

---

## 📝 Notas Finales

Este plan está diseñado específicamente para tu arquitectura actual:
- Respeta la estructura existente de FastAPI con rutas modulares
- Utiliza MongoDB ya configurado
- Aprovecha componentes UI de shadcn/ui existentes
- Mantiene compatibilidad con el sistema de chat actual
- Permite migración gradual sin romper funcionalidad existente

Cada PR es independiente y puede ser revisado/testeado por separado, facilitando el desarrollo incremental y la detección temprana de problemas.