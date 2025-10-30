# Reporte de Análisis de Arquitectura - Chatbot RAG
**Fecha:** 16 de Diciembre, 2024  
**Arquitecto:** Análisis Automatizado  
**Stack:** Next.js (Frontend) + FastAPI (Backend)

## Resumen Ejecutivo

Tras realizar un análisis exhaustivo de la base de código, se han identificado **oportunidades críticas de mejora** en seguridad, separación de responsabilidades y optimización del widget embebible. El proyecto presenta una arquitectura sólida pero requiere ajustes específicos para cumplir con los requerimientos de anonimato del widget y protección contra clickjacking.

## Hallazgos Principales

### ✅ Aspectos Positivos
- **Arquitectura clara:** Separación bien definida entre `/chat` (app principal) y `/widget` (embebible)
- **CORS configurado:** Sistema de CORS diferenciado con `cors_origins_widget` y `cors_origins_admin`
- **Widget anónimo:** No se encontró lógica de autenticación innecesaria en el widget
- **Componentes modulares:** Buena separación de componentes UI reutilizables

### ⚠️ Áreas de Mejora Críticas
- **Seguridad de cabeceras HTTP:** Configuración inadecuada para prevenir clickjacking
- **Separación de rutas:** Widget y app principal comparten demasiados recursos
- **Optimización de carga:** Widget carga componentes innecesarios de la app principal
- **Configuración de Next.js:** Headers de seguridad no diferenciados por ruta

---

## Pull Requests Propuestos

### PR #1: Implementar Cabeceras de Seguridad Diferenciadas
**Prioridad:** 🔴 CRÍTICA  
**Problema:** Actualmente, la configuración de `X-Frame-Options` en `next.config.js` permite que `/chat` sea embebido (riesgo de clickjacking) y no está optimizada para el widget.

**Solución Propuesta:**
```javascript
// next.config.js - Sección de headers actualizada
async headers() {
  return [
    // Configuración para el widget (permite embedding)
    {
      source: '/widget/:path*',
      headers: [
        {
          key: 'X-Frame-Options',
          value: 'SAMEORIGIN', // O remover completamente para permitir embedding externo
        },
        {
          key: 'Content-Security-Policy',
          value: "frame-ancestors 'self' *", // Permite embedding desde cualquier dominio
        },
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
    // Configuración para todas las demás rutas (previene clickjacking)
    {
      source: '/((?!widget).*)',
      headers: [
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'Content-Security-Policy',
          value: "frame-ancestors 'none'",
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
      ],
    },
  ];
}
```

**Impacto:** 
- ✅ Previene clickjacking en rutas administrativas
- ✅ Permite embedding seguro del widget
- ✅ Mejora la postura de seguridad general

---

### PR #2: Refactorizar Arquitectura de Rutas con Route Groups
**Prioridad:** 🟡 ALTA  
**Problema:** El widget y la app principal comparten el mismo layout y cargan componentes innecesarios, afectando el rendimiento y la separación de responsabilidades.

**Solución Propuesta:**
Implementar Route Groups de Next.js 13+ para separar completamente las rutas:

```
app/
├── (admin)/                 # Grupo para app principal
│   ├── layout.tsx          # Layout con sidebar y autenticación futura
│   ├── page.tsx            # Dashboard
│   ├── chat/
│   │   └── page.tsx        # Chat principal
│   ├── configuracion/
│   └── Documents/
├── (widget)/               # Grupo para widget embebible
│   ├── layout.tsx          # Layout minimalista sin sidebar
│   └── widget/
│       └── page.tsx        # Widget preview
└── (embedded)/             # Grupo para iframe embebible
    ├── layout.tsx          # Layout ultra-minimalista
    └── embed/
        └── page.tsx        # Chat embebible real
```

**Archivos a crear/modificar:**

1. **`app/(admin)/layout.tsx`** - Layout completo con sidebar
```tsx
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-full bg-background">
        <AppSidebar />
        <main className="flex-1 p-4">{children}</main>
      </div>
    </SidebarProvider>
  );
}
```

2. **`app/(embedded)/layout.tsx`** - Layout minimalista para iframe
```tsx
export default function EmbeddedLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="m-0 p-0 overflow-hidden">
        {children}
      </body>
    </html>
  );
}
```

**Impacto:**
- ✅ Separación completa de responsabilidades
- ✅ Widget más ligero y rápido
- ✅ Preparación para autenticación futura en rutas admin
- ✅ Mejor SEO y caching diferenciado

---

### PR #3: Optimizar Widget y Crear Endpoint Embebible Dedicado
**Prioridad:** 🟡 ALTA  
**Problema:** El widget actual apunta a `/chat` que incluye navegación y elementos innecesarios para embedding.

**Solución Propuesta:**

1. **Crear ruta embebible dedicada:** `/embed`
```tsx
// app/(embedded)/embed/page.tsx
"use client";
import { ChatWindow } from "@/components/ChatWindow";
import { v4 as uuidv4 } from "uuid";
import { useMemo } from "react";

export default function EmbedPage() {
  const conversationId = useMemo(() => uuidv4(), []);
  
  return (
    <div className="h-screen w-full">
      <ChatWindow 
        conversationId={conversationId}
        placeholder="¿En qué puedo ayudarte?"
      />
    </div>
  );
}
```

2. **Actualizar WidgetPreview para usar nueva ruta:**
```tsx
// Cambiar en WidgetPreview.tsx
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}/embed`;
  }
  return '/embed';
};
```

**Impacto:**
- ✅ Widget 100% anónimo y optimizado
- ✅ Carga más rápida del iframe
- ✅ Separación clara de funcionalidades

---

### PR #4: Implementar Middleware de Seguridad en FastAPI
**Prioridad:** 🟡 MEDIA  
**Problema:** El backend no tiene cabeceras de seguridad específicas para diferentes endpoints.

**Solución Propuesta:**
```python
# backend/middleware/security.py
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Headers para endpoints embebibles
        if request.url.path.startswith("/api/v1/chat"):
            response.headers["X-Frame-Options"] = "SAMEORIGIN"
            response.headers["Access-Control-Allow-Origin"] = "*"
        else:
            # Headers restrictivos para endpoints admin
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-Content-Type-Options"] = "nosniff"
            
        return response

# En app.py, agregar:
app.add_middleware(SecurityHeadersMiddleware)
```

**Impacto:**
- ✅ Protección adicional a nivel de API
- ✅ Consistencia con configuración frontend
- ✅ Flexibilidad para diferentes tipos de endpoints

---

### PR #5: Optimizar Componentes Compartidos y Bundle Splitting
**Prioridad:** 🟢 MEDIA  
**Problema:** Componentes UI se cargan innecesariamente en diferentes contextos.

**Solución Propuesta:**

1. **Crear componentes específicos para widget:**
```tsx
// components/widget/MinimalChatWindow.tsx - Versión ligera sin sidebar
// components/widget/EmbedLayout.tsx - Layout específico para embedding
```

2. **Optimizar imports dinámicos:**
```tsx
// Lazy loading más agresivo para componentes pesados
const AdminDashboard = lazy(() => import("@/components/admin/Dashboard"));
const WidgetChat = lazy(() => import("@/components/widget/MinimalChat"));
```

3. **Configurar bundle splitting en next.config.js:**
```javascript
webpack: (config) => {
  config.optimization.splitChunks = {
    chunks: 'all',
    cacheGroups: {
      widget: {
        test: /[\\/]components[\\/]widget[\\/]/,
        name: 'widget',
        priority: 10,
      },
      admin: {
        test: /[\\/]components[\\/](admin|ui)[\\/]/,
        name: 'admin',
        priority: 10,
      },
    },
  };
  return config;
}
```

**Impacto:**
- ✅ Carga más rápida del widget
- ✅ Mejor experiencia de usuario
- ✅ Optimización de recursos

---

## Cronograma de Implementación

| PR | Prioridad | Tiempo Estimado | Dependencias |
|----|-----------|-----------------|--------------|
| PR #1 | 🔴 CRÍTICA | 2-4 horas | Ninguna |
| PR #2 | 🟡 ALTA | 1-2 días | PR #1 |
| PR #3 | 🟡 ALTA | 4-6 horas | PR #2 |
| PR #4 | 🟡 MEDIA | 2-3 horas | PR #1 |
| PR #5 | 🟢 MEDIA | 1 día | PR #2, PR #3 |

## Métricas de Éxito

### Seguridad
- [ ] Todas las rutas admin protegidas contra clickjacking
- [ ] Widget embebible funcionando correctamente
- [ ] Headers de seguridad implementados correctamente

### Performance
- [ ] Tiempo de carga del widget < 2 segundos
- [ ] Bundle size del widget < 500KB
- [ ] Lighthouse score > 90 para rutas embebibles

### Funcionalidad
- [ ] Widget 100% anónimo y funcional
- [ ] Separación completa admin/widget
- [ ] CORS configurado correctamente para ambos contextos

## Notas Adicionales

### Consideraciones de Seguridad
- El widget debe mantener anonimato completo
- Implementar rate limiting específico para endpoints embebibles
- Considerar CSP más restrictivo para rutas administrativas futuras

### Preparación para Autenticación Futura
- La estructura de Route Groups facilita la implementación de middleware de auth
- Separación clara permite diferentes estrategias de autenticación por contexto
- Headers de seguridad ya preparados para entornos autenticados

### Testing
- Implementar tests E2E para embedding en diferentes dominios
- Verificar funcionamiento correcto de headers de seguridad
- Validar performance del widget en diferentes dispositivos

---

**Próximos Pasos:** Comenzar con PR #1 (Cabeceras de Seguridad) por ser crítico para la seguridad, seguido de PR #2 (Route Groups) para establecer la base arquitectónica sólida.