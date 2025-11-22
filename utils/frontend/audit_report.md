# Auditoría de Frontend — Chatbot

## 1. Resumen Ejecutivo
- Estado general: 6.5/10
- Riesgo general: alto
- Observación: el proyecto usa Next.js 14 con buen uso de App Router y SSE, pero hay decisiones que elevan riesgos de seguridad y mantenibilidad (tokens accesibles desde JS, ignorar errores de build, mezcla de librerías de UI, componentes muy grandes).

## 2. Hallazgos Críticos
- Uso de tokens de autenticación en `localStorage` y cookie legible por JS.
  - Evidencia: `frontend/app/lib/services/authService.ts:44-52` guarda `auth_token` en `localStorage` y lo replica como cookie no-HttpOnly; `frontend/middleware.ts:35` lee la cookie.
  - Impacto: ante un XSS, el atacante exfiltra el token; la cookie no puede ser `HttpOnly` al ser seteada en el cliente.
- Build ignora errores de TypeScript y ESLint en producción.
  - Evidencia: `frontend/next.config.js:3-14` (`ignoreDuringBuilds: true`, `ignoreBuildErrors: true`).
  - Impacto: se pueden desplegar builds con errores que se manifiesten en runtime, generando fallas difíciles de detectar.
- Mezcla simultánea de 3 sistemas de UI (Tailwind, Radix UI y Chakra UI).
  - Evidencia: `frontend/package.json:13-18,19-43,66` y componentes en `app/components/ui/*` junto con `FloatingChatWidget.tsx` usando Chakra.
  - Impacto: aumento del tamaño del bundle, duplicidad de patrones, complejidad de estilos y accesibilidad inconsistente.
- Snippet de widget con `<script>` inline y manipulación de `innerHTML` para toggling.
  - Evidencia: `frontend/app/components/WidgetPreview.tsx:80-93`.
  - Impacto: fomenta integraciones con CSP permisiva; si en el futuro se interpolan datos, abre superficie de XSS. Debe migrarse a `script src` con bundle propio y sin `innerHTML`.

## 3. Hallazgos Importantes
- Autenticación híbrida (Bearer y cookies) usada en distintas rutas.
  - Evidencia: SSE del chat usa `credentials: "include"` (`frontend/app/hooks/useChatStream.ts:52`), mientras el resto usa Bearer (`authenticatedFetch`).
  - Impacto: complejiza la política de CSRF y CORS; es fácil introducir inconsistencias de seguridad.
- Monolito de UI muy grande.
  - Evidencia: `frontend/app/components/ui/sidebar.tsx` (~755 líneas).
  - Impacto: dificulta testing, reusabilidad y evolución; incrementa riesgo de regresiones.
- Logging excesivo en producción (incluye emails, estados y detalles de errores).
  - Evidencia: `authService.login` y otros (`frontend/app/lib/services/authService.ts:92,114,121`), `statsService.ts:7-36`, etc.
  - Impacto: ruido, posibles fugas de PII y pistas para atacantes.
- CSP parcial y cabeceras legacy.
  - Evidencia: `frontend/next.config.js:107-155` define `frame-ancestors` pero no establece `default-src`, `script-src` estricto; usa `X-XSS-Protection` (deprecada).
  - Impacto: protección incompleta ante inyecciones y recursos externos.

## 4. Hallazgos Menores
- Uso de `localStorage` para `theme` y `conversation_id` sin cifrado.
  - Evidencia: `frontend/app/components/AppSidebar.tsx:96,118`; `frontend/app/chat/page.tsx:15,22`.
  - Impacto: bajo; preferible aislar claves y validar contenido.
- `critters` y grupos de `splitChunks` referencian librerías no usadas (recharts/d3).
  - Evidencia: `frontend/next.config.js:52-58`.
  - Impacto: confusión y mantenimiento innecesario.
- Doble sistema de toasts (`sonner` y Radix Toast).
  - Evidencia: `frontend/app/layout.tsx:21` y `frontend/app/components/ui/toast.tsx`.
  - Impacto: duplicación funcional y estilos.

## 5. Bombas de Tiempo Detectadas
- Ignorar errores de build (TypeScript/ESLint).
  - Por qué: oculta deuda y rompe en runtime.
  - Cuándo explotan: al crecer el equipo o actualizar dependencias.
  - Impacto: despliegues con errores, downtime, costos de hotfix.
- Tokens en `localStorage` y cookie accesible.
  - Por qué: XSS = exfiltración inmediata.
  - Cuándo explotan: cualquier vector XSS (lib de terceros, interpolación futura).
  - Impacto: cuentas comprometidas, escalada de privilegios.
- Mezcla de sistemas de UI.
  - Por qué: decisiones estilísticas divergentes y accesibilidad inconsistente.
  - Cuándo explotan: al agregar features o temas; conflictos CSS y aumento de bundle.
  - Impacto: bugs visuales, rendimiento degradado, alto costo de refactor.
- Componente `sidebar` monolítico.
  - Por qué: baja cohesión, alta complejidad.
  - Cuándo explotan: nuevos requisitos, refactors.
  - Impacto: regresiones frecuentes, ciclo de desarrollo más lento.

## 6. Seguridad
- XSS
  - React escapa contenido por defecto (mensajes en `ChatMessageBubble`), pero hay `innerHTML` en el widget (estático ahora).
  - Recomendación: prohibir `innerHTML`, usar DOM seguro y plantillas React.
- CSRF
  - El chat usa cookies (`credentials: include`) en `POST`; si el backend permite acciones con cookies, requerir token CSRF y same-site estricto.
  - Recomendación: unificar auth en Bearer o cookies HttpOnly con CSRF.
- Leaking de tokens
  - `auth_token` accesible por JS y replicado en `localStorage`.
  - Recomendación: tokens sólo en HttpOnly Secure cookies desde el backend; o en memoria (no persistente) + rotación corta.
- Sanitización
  - No se observa sanitización explícita; React mitiga HTML. Si algún día se usa `dangerouslySetInnerHTML`, incorporar DOMPurify.
- Secrets expuestos
  - UI de WhatsApp muestra SID y token en formularios (`frontend/app/configuracion-whatsapp/page.tsx:121-141`). No se guardan en cliente, pero evitar logs y proteger con permisos admin.

## 7. Performance
- Puntos problemáticos
  - Bundle mayor por mezclar Chakra/Emotion + Radix + Tailwind.
  - Muchos componentes `"use client"` en App Router, aumentando hidratación.
  - Logging abundante en producción.
- Indicadores de riesgo
  - Config de `splitChunks` personalizada sin medición real; podría fragmentar en exceso.
  - `sidebar.tsx` extenso impacta render inicial.
  - SSE con `openWhenHidden: true` (`frontend/app/hooks/useChatStream.ts:59`) puede mantener conexiones innecesarias.

## 8. Mantenibilidad
- Complejidad innecesaria
  - Tres sistemas de UI y configuración webpack no alineada a uso real.
- Repetición
  - Doble sistema de toasts; patrones de fetch y manejo de errores repetidos.
- Falta de aislamiento
  - `sidebar.tsx` monolítico; sería deseable dividir por submódulos.

## 9. Dependencias
- Riesgos
  - `next@^14.1.0` y `react@18.2.0` no son los últimos; revisar changelogs de seguridad.
  - `@emotion/*` + Chakra + Radix: superposición de estilos.
- Obsoletas
  - `X-XSS-Protection` (header legacy) en `next.config.js`.
- Inseguras (potenciales)
  - No se detectan CVEs directas sin escaneo, pero la configuración de build que ignora errores agrava cualquier actualización.

## 10. Recomendaciones Prioritarias
1) Eliminar `ignoreDuringBuilds` y `ignoreBuildErrors` y hacer cumplir lint/typecheck en CI/CD.
2) Migrar autenticación a cookies HttpOnly `Secure` emitidas por backend o a token en memoria temporal; eliminar escritura de cookies en cliente.
3) Publicar el widget como script externo (`<script src>`), sin inline JS ni `innerHTML`.
4) Consolidar el sistema de UI: elegir entre Tailwind+Radix o Chakra; retirar el resto.
5) Dividir `sidebar.tsx` en subcomponentes y reducir tamaño de archivos.
6) Endurecer CSP: `default-src 'self'`; `script-src 'self'` con nonce; `connect-src` a API; limitar `frame-ancestors` y remover `X-XSS-Protection`.
7) Reducir logging en producción; evitar PII y traces verbosos.
8) Unificar auth (Bearer o cookies) y, si cookies, añadir CSRF token y `SameSite=Strict`.
9) Actualizar dependencias (Next.js, React, Radix, Chakra) tras pasar lint/typecheck.
10) Añadir tests de integración básicos para flujos críticos (login, SSE chat, gestión de PDFs).

---

Notas de referencia en código:
- `frontend/app/lib/services/authService.ts:44-52, 73-80, 268-284`
- `frontend/middleware.ts:33-53`
- `frontend/next.config.js:3-21,31-69,79-167`
- `frontend/app/components/WidgetPreview.tsx:80-93`
- `frontend/app/hooks/useChatStream.ts:52-60`
- `frontend/app/components/ui/sidebar.tsx:1-755`
- `frontend/package.json:13-56,58-69`