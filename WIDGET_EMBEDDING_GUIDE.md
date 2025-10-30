# 🤖 Guía de Embedding del Widget de Chat

## 📋 Resumen Ejecutivo

Este documento describe la configuración final del widget de chat embebido, incluyendo las políticas de seguridad, dominios permitidos y limitaciones técnicas.

## 🎯 Estado Actual

### ✅ **Configuración Funcional**
- **Widget URL:** `http://localhost:3000/chat`
- **Test URL:** `http://localhost:8080/widget-embed-test.html`
- **Protocolo:** HTTP únicamente
- **Estado:** ✅ Funcionando correctamente

### 🔒 **Seguridad Implementada**
- **Content Security Policy (CSP):** Configurado
- **X-Frame-Options:** Controlado por CSP
- **Same-Origin Policy:** Respetado

## 🌐 Dominios Permitidos para Embedding

### 🛠️ **Desarrollo (Actual)**
```
'self' http://localhost:3000 http://localhost:8080
```

### 🚀 **Producción**
La configuración de producción se controla mediante la variable de entorno:
```bash
CORS_ORIGINS_WIDGET="https://dominio1.com,https://dominio2.com"
```

## 📁 Archivos de Configuración

### 🔧 **CSP Principal**
- **Archivo:** `frontend/next.config.js`
- **Líneas:** 85-120
- **Función:** Controla qué dominios pueden embeber el widget

### 🧪 **Archivo de Test**
- **Archivo:** `widget-embed-test.html`
- **Propósito:** Verificar funcionamiento del embedding
- **Acceso:** `http://localhost:8080/widget-embed-test.html`

## 🚫 Limitaciones Técnicas

### ❌ **No Funciona Con:**
1. **Protocolo `file://`**
   - Razón: Políticas de seguridad del navegador
   - Solución: Usar servidor HTTP local

2. **Dominios no autorizados**
   - Error: "Refused to frame"
   - Solución: Agregar dominio al CSP

3. **HTTPS mixto con HTTP**
   - Problema: Mixed content blocking
   - Solución: Usar mismo protocolo

## 🔧 Cómo Agregar Nuevos Dominios

### 🛠️ **Para Desarrollo:**
Editar `frontend/next.config.js` línea ~90:
```javascript
chatFrameAncestors = "'self' http://localhost:3000 http://localhost:8080 http://nuevo-dominio.com";
```

### 🚀 **Para Producción:**
Configurar variable de entorno:
```bash
CORS_ORIGINS_WIDGET="https://dominio1.com,https://dominio2.com,https://nuevo-dominio.com"
```

## 📝 Instrucciones de Uso

### 🎯 **Para Embeber el Widget:**

1. **HTML Básico:**
```html
<iframe 
    src="http://localhost:3000/chat" 
    style="position: fixed; bottom: 20px; right: 20px; width: 350px; height: 500px; border: none; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 1000;"
    title="Chat Widget">
</iframe>
```

2. **Verificar Dominio:**
   - Asegurar que el dominio esté en la lista de permitidos
   - Usar protocolo HTTP en desarrollo
   - Usar HTTPS en producción

3. **Test Local:**
   - Acceder a: `http://localhost:8080/widget-embed-test.html`
   - Verificar que no hay errores en consola (F12)

## 🔍 Troubleshooting

### 🚨 **Error: "Refused to frame"**
- **Causa:** Dominio no autorizado en CSP
- **Solución:** Agregar dominio a `chatFrameAncestors`

### 🚨 **Error: "localhost refused to connect"**
- **Causa:** Servicios no ejecutándose
- **Solución:** Ejecutar `docker-compose up -d`

### 🚨 **Error desde `file://`**
- **Causa:** Protocolo no soportado
- **Solución:** Usar servidor HTTP local

## 🏗️ Arquitectura de Seguridad

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Sitio Web     │    │   Widget Chat    │    │   Backend API   │
│   (Embedding)   │───▶│  (localhost:3000)│───▶│ (localhost:8000)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │
        │                        │
        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐
│      CSP        │    │   CORS Policy    │
│  frame-ancestors│    │   API Access     │
└─────────────────┘    └──────────────────┘
```

## 📊 Estado de Archivos

### ✅ **Archivos Activos:**
- `widget-embed-test.html` - Test de embedding
- `frontend/next.config.js` - Configuración CSP
- `WIDGET_EMBEDDING_GUIDE.md` - Esta documentación

### 🗑️ **Archivos Eliminados (Redundantes):**
- `simple-test.html`
- `test-widget-local.html`
- `test-widget.html`
- `test-file-protocol.html`

## 🎉 Conclusión

El widget de chat está **completamente funcional** para embedding desde dominios autorizados. La configuración actual permite desarrollo local y es fácilmente extensible para producción mediante variables de entorno.

### 🔑 **Puntos Clave:**
1. ✅ Funciona desde `http://localhost:8080`
2. ✅ CSP configurado correctamente
3. ✅ Seguridad implementada
4. ✅ Fácil de extender para nuevos dominios
5. ❌ No funciona desde `file://` (por diseño de seguridad)

---
**Última actualización:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")  
**Estado:** ✅ Producción Ready