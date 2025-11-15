# Informe de Optimización de Frontend y Docker

Fecha: 2025-11-15
Proyecto: Chatbot_Rag_final
Ámbito: frontend y configuración Docker (foco en causas de peso excesivo)

## Resumen Ejecutivo
- El frontend usa Next.js 14 con una combinación de componentes `shadcn/ui` (Radix UI) y utilidades propias.
- El Dockerfile del frontend está orientado a desarrollo (`yarn dev`) y no diferencia dependencias de producción, lo que incrementa tamaño y contexto de build.
- Faltan `.dockerignore` específicos en `frontend/` y `backend/`, por lo que el contexto puede incluir carpetas pesadas si existen (`.next/`, `node_modules/`, etc.).
- Se identificaron dependencias que no presentan uso en el código y podrían eliminarse para reducir tamaño del `node_modules` y del bundle.

Recomendaciones clave:
- Añadir `frontend/.dockerignore` y `backend/.dockerignore` (alto impacto, alta seguridad).
- Convertir Dockerfile del frontend a multi-stage y `NODE_ENV=production` (alto impacto, alta seguridad).
- Eliminar paquetes no usados (react-icons, graphql, highlight.js, marked, react-toastify, critters, fast-json-patch) tras verificación (medio-alto impacto, alta seguridad).
- Opcional: habilitar `output: 'standalone'` en `next.config.js` para copiar sólo runtime mínimo.

---

## 1. Análisis de Dependencias

Fuente: `frontend/package.json`

### 1.1 Listado de librerías instaladas (dependencies y devDependencies)

Dependencias de runtime:
- @chakra-ui/icons, @chakra-ui/react, @emotion/react, @emotion/styled
- @microsoft/fetch-event-source
- @radix-ui/react-accordion, @radix-ui/react-alert-dialog, @radix-ui/react-aspect-ratio, @radix-ui/react-avatar, @radix-ui/react-checkbox,
  @radix-ui/react-collapsible, @radix-ui/react-context-menu, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @radix-ui/react-hover-card,
  @radix-ui/react-label, @radix-ui/react-menubar, @radix-ui/react-navigation-menu, @radix-ui/react-popover, @radix-ui/react-progress,
  @radix-ui/react-radio-group, @radix-ui/react-scroll-area, @radix-ui/react-select, @radix-ui/react-separator, @radix-ui/react-slider,
  @radix-ui/react-slot, @radix-ui/react-switch, @radix-ui/react-tabs, @radix-ui/react-toast, @radix-ui/react-tooltip
- @types/marked, @types/node, @types/react, @types/react-dom
- autoprefixer, caniuse-lite
- class-variance-authority, clsx
- emojisplosion
- eslint, eslint-config-next
- fast-json-patch
- framer-motion
- graphql
- highlight.js
- critters
- langsmith
- lucide-react
- marked
- next
- postcss
- react, react-dom, react-icons, react-textarea-autosize, react-toastify, sonner
- tailwind-merge, tailwindcss
- typescript

Dependencias de desarrollo:
- prettier, tailwindcss-animate, typescript (duplicada en ambas secciones)

### 1.2 Uso detectado vs no detectado

- Usadas (evidencia en código):
  - Radix UI: múltiples componentes en `app/components/ui/*.tsx` importan `@radix-ui/react-*` (p. ej. `dialog.tsx`, `tooltip.tsx`, `checkbox.tsx`).
  - `lucide-react`: usado extensivamente en componentes e iconos.
  - `@microsoft/fetch-event-source`: usado dinámicamente en `app/hooks/useChatStream.ts`.
  - `class-variance-authority`, `clsx`, `tailwind-merge`: usados en `app/components/ui/*` y `app/lib/utils.ts`.
  - `sonner`: usado en `app/layout.tsx` y múltiples componentes.
  - `react-textarea-autosize`: usado en `app/components/AutoResizeTextarea.tsx`.
  - `emojisplosion`: usado en `app/components/ChatMessageBubble.tsx`.
  - `langsmith`: usado en `app/api/feedback/route.ts` y `app/api/get_trace/route.ts`.

- No detectadas en código (candidatas a eliminación, verificación recomendada):
  - `react-icons` (ninguna importación encontrada; se usa `lucide-react`).
  - `graphql` (sin referencias; no hay `gql`, `graphql-tag` ni imports directos).
  - `highlight.js` (sin referencias).
  - `marked` y `@types/marked` (sin referencias).
  - `react-toastify` (sin referencias; se usa `sonner` y un sistema de `toast` propio).
  - `critters` (sin configuración o uso en build).
  - `fast-json-patch` (sin referencias).
  - `framer-motion` (sin importaciones ni uso de `motion`).

- Observaciones sobre dependencia-ubicación:
  - `tailwindcss`, `postcss`, `autoprefixer` son herramientas de build y podrían estar sólo en `devDependencies`. Al instalar en producción con `--production`, se excluyen (impacto en tamaño del `node_modules`).
  - `typescript` aparece tanto en `dependencies` como en `devDependencies`. Debería quedar solo en `devDependencies`.

### 1.3 Versiones obsoletas o alternativas ligeras

- `node:18-alpine` es estable; considerar `node:20-alpine` (LTS) por seguridad y mejoras, impacto de tamaño similar.
- `next@^14.1.0` es reciente; activar `output: 'standalone'` para reducir artefactos en imagen.
- `lucide-react` está correcto; mantener.
- Alternativas:
  - Si no se usan funcionalidades de gráficos, eliminar `recharts` (no presente) y `d3-*` (no presentes); el `next.config.js` tiene un `cacheGroup` para `recharts` que podría ser residual.

Nivel de confianza de eliminación (ver sección 4): ver tabla de recomendaciones.

---

## 2. Revisión de Código

### 2.1 Archivos y módulos no referenciados

- UI potencialmente no referenciados (no se encontraron importaciones directas):
  - `app/components/ui/`: `carousel.tsx`, `chart.tsx`, `command.tsx`, `drawer.tsx`, `input-otp.tsx`, `resizable.tsx`, `table.tsx`, `toggle-group.tsx`, `toggle.tsx`.
  - Nivel de confianza de no uso: 70–85% (pueden ser usados indirectamente; verificar antes de retirar).

- Páginas redundantes:
  - `pages/404.tsx` y `pages/500.tsx` pueden ser redundantes porque el proyecto usa `app/not-found.tsx` y `app/error.tsx`.
  - Nivel de confianza: 90% (verificar rutas en producción).

### 2.2 Funciones y componentes nunca invocados

- No se detectó instrumentación centralizada de análisis estático; con búsquedas textuales no se encontraron usos de los componentes listados en 2.1.
- Recomendación: usar `ts-prune` o `depcheck` para validar no-uso a nivel de TypeScript/JS antes de eliminar.

### 2.3 Código comentado que podría eliminarse

- El código comentado encontrado es principalmente documentación inline, no bloques grandes de features deshabilitados.
- No se recomienda eliminar comentarios actuales; bajo impacto en tamaño.

### 2.4 Assets estáticos no utilizados

- `public/`: solo `favicon.ico` presente; es estándar y probablemente necesario.
- No se detectaron imágenes, fuentes u otros assets no usados.

---

## 3. Optimización de Docker

### 3.1 Archivos innecesarios incluidos en la imagen

- `frontend`: No existe `frontend/.dockerignore`. Riesgo de incluir:
  - `node_modules/` (si existe localmente).
  - `.next/` (artefactos de build).
  - `.git/`, archivos temporales.

- `backend`: No existe `backend/.dockerignore`. Riesgo de incluir:
  - `__pycache__/`, `.pytest_cache/`, data local en `storage/documents/`, `.env*`.

Sugerencia de `.dockerignore` (frontend):
```
node_modules/
.next/
out/
.git/
.gitignore
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.DS_Store
*.log
*.swp
*.swo
.env*
.vercel/
coverage/
build/
```

Sugerencia de `.dockerignore` (backend):
```
__pycache__/
*.py[cod]
*$py.class
.pytest_cache/
.env*
.env
venv/
.venv/
ENV/
.git/
.gitignore
*.log
storage/documents/**/*.pdf
storage/vector_store/**
```

### 3.2 Mejoras en Dockerfile del frontend

- Actual: imagen de desarrollo (`yarn dev`).
- Sugerido (multi-stage producción):
  1) `deps`: instalar dependencias con cache de lockfile, usando `NODE_ENV=production` para excluir dev deps.
  2) `builder`: compilar `next build` con `NEXT_TELEMETRY_DISABLED=1` y opcional `output: 'standalone'`.
  3) `runner`: copiar sólo artefactos necesarios (`.next/standalone`, `.next/static`, `public`) y correr `next start`.

- Cambios clave:
  - `ENV NODE_ENV=production`
  - `RUN yarn install --frozen-lockfile --production=true`
  - `RUN yarn build`
  - `CMD ["yarn", "start"]`

### 3.3 Mejoras en Dockerfile del backend

- En `docker-compose.yml` se usa `backend/Dockerfile` (base `python:3.11`). Este es más ligero que el Dockerfile raíz (`ubuntu:22.04` + apt). Mantener `backend/Dockerfile` para dev/prod.
- Si el Dockerfile raíz se usa en algún entorno (p. ej. Render), considerar `python:3.11-slim` y sólo instalar librerías del sistema estrictamente necesarias (evitar paquetes gráficos si no son requeridos).

### 3.4 Configuraciones de build optimizables

- `next.config.js`:
  - Añadir `output: 'standalone'` para minimizar runtime copiado.
  - Mantener `experimental.optimizePackageImports` (ya presente).
- `docker-compose.yml` (dev): correcto para hot-reload, pero en producción usar imágenes construidas sin montar el código.

---

## 4. Nivel de Confianza para Eliminación

Tabla de elementos identificados con seguridad e impacto estimado:

| Elemento | Tipo | Uso detectado | Seguridad eliminación | Impacto potencial | Dependencias cruzadas |
|---|---|---:|---:|---|---|
| `react-icons` | librería | No | 95% | Reduce deps duplicadas de iconos | Usa `lucide-react` ampliamente |
| `graphql` | librería | No | 95% | Menor tamaño de `node_modules` | Ninguna detectada |
| `highlight.js` | librería | No | 95% | Reduce bundle si estaba incluido | Ninguna detectada |
| `marked` + `@types/marked` | librería | No | 95% | Menor `node_modules` | Ninguna detectada |
| `react-toastify` | librería | No | 95% | Evita duplicar sistema de toasts | Se usa `sonner` y `useToast` |
| `critters` | librería | No | 95% | Menor `node_modules` | Ninguna detectada |
| `fast-json-patch` | librería | No | 90% | Menor `node_modules` | Verificar en futuros features |
| `framer-motion` | librería | No | 90% | Menor bundle (~70–100KB) | Verificar animaciones futuras |
| `pages/404.tsx`, `pages/500.tsx` | archivos | Redundante | 90% | Menor superficie del repo | Usar `app/not-found.tsx`, `app/error.tsx` |
| `ui/*` listados (posibles) | archivos | Dudoso | 70–85% | Reducir superficie y bundle | Verificar con `depcheck`/`ts-prune` |
| Mover `typescript`, `tailwindcss`, `postcss`, `autoprefixer` a dev | config | Sí (build) | 90% | Excluir en prod (`--production`) | Afecta sólo al build |

---

## 5. Tablas Comparativas de Peso

Valores estimados (orientativos; verificar en entorno):

### 5.1 Frontend

| Escenario | Base | Dependencias | Artefactos | Tamaño estimado |
|---|---|---|---|---|
| Actual dev (`node:18-alpine`, `yarn install` completo, `yarn dev`) | ~120MB | +150–250MB | Código completo | ~300–400MB |
| Producción multi-stage (`NODE_ENV=production`, `next build`, `next start`) | ~120MB | +80–150MB | Sólo `.next/standalone + static + public` | ~180–250MB |
| Producción con eliminación de deps no usadas | ~120MB | +60–120MB | Igual | ~160–220MB |

### 5.2 Backend

| Escenario | Base | Paquetes sistema | `pip` deps | Tamaño estimado |
|---|---|---|---|---|
| `backend/Dockerfile` (`python:3.11`) | ~110MB | 0 | +150–300MB (según `requirements.txt`) | ~260–410MB |
| Dockerfile raíz (`ubuntu:22.04` + muchos `apt`) | ~77MB | +300–500MB | +150–300MB | >600MB |

---

## 6. Comandos de Verificación

Use PowerShell (Windows) o Git Bash:

### 6.1 Verificar uso de librerías
- `Select-String -Path ./frontend -Pattern "react-icons|graphql|highlight.js|marked|react-toastify|critters|fast-json-patch|framer-motion" -Filter *.ts? -Recurse`
- Alternativa (Git Bash): `rg -n "react-icons|graphql|highlight.js|marked|react-toastify|critters|fast-json-patch|framer-motion" frontend`

### 6.2 Medir tamaño de `node_modules`
- `powershell -Command "Get-ChildItem ./frontend/node_modules -Recurse | Measure-Object -Property Length -Sum"`
- Alternativa (Git Bash): `du -sh frontend/node_modules`

### 6.3 Construir y medir imágenes
- Frontend dev: `docker build -t chatbot-frontend:dev -f frontend/Dockerfile ./frontend && docker image ls chatbot-frontend:dev`
- Frontend prod (propuesto): `docker build -t chatbot-frontend:prod -f frontend/Dockerfile .` (tras convertir a multi-stage y `start`)
- Backend dev: `docker build -t chatbot-backend:dev -f backend/Dockerfile ./backend && docker image ls chatbot-backend:dev`
- Backend raíz (si se usa): `docker build -t chatbot-backend:root -f Dockerfile . && docker image ls chatbot-backend:root`

### 6.4 Detectar módulos no usados
- `npx depcheck` dentro de `frontend/` (detecta dependencias no usadas).
- `npx ts-prune` dentro de `frontend/` (detecta exports no usados).

---

## 7. Recomendaciones Priorizadas

1) Añadir `.dockerignore` a `frontend/` y `backend/`.
   - Impacto: alto | Seguridad: 100% | Motivo: reduce contexto y tamaño de imagen.
2) Convertir Dockerfile del frontend para producción (multi-stage) y usar `NODE_ENV=production` + `yarn install --production=true`.
   - Impacto: alto | Seguridad: 95% | Motivo: reduce tamaño y excluye dev deps.
3) Eliminar dependencias no usadas: `react-icons`, `graphql`, `highlight.js`, `marked`, `@types/marked`, `react-toastify`, `critters`, `fast-json-patch`, `framer-motion` (tras verificación con `depcheck` y búsqueda manual).
   - Impacto: medio-alto | Seguridad: 90–95%.
4) Mover `tailwindcss`, `postcss`, `autoprefixer`, `typescript` a `devDependencies`.
   - Impacto: medio | Seguridad: 90%.
5) Opcional: `next.config.js` → `output: 'standalone'`.
   - Impacto: medio | Seguridad: 95%.
6) Backend: mantener `backend/Dockerfile` (ligero) y evitar el Dockerfile raíz en entornos productivos salvo necesidad.
   - Impacto: alto | Seguridad: 90%.

---

## 8. Anexos (Evidencia)

- Radix UI: `app/components/ui/dialog.tsx`, `tooltip.tsx`, `checkbox.tsx` importan `@radix-ui/react-*`.
- `lucide-react`: múltiples importaciones en `AppSidebar.tsx`, `Dashboard.tsx`, `LoginForm.tsx`, etc.
- `fetch-event-source`: `app/hooks/useChatStream.ts`.
- `sonner`: `app/layout.tsx`, `BotConfiguration.tsx`, `usuarios/page.tsx`.
- Dependencias no referenciadas: sin coincidencias de `react-icons`, `graphql`, `highlight.js`, `marked`, `react-toastify`, `critters`, `fast-json-patch`, `framer-motion`.

---

## 9. Conclusión

La mayor parte del peso extra proviene de:
- Falta de `.dockerignore` (amplía contexto de build).
- Uso de imagen de desarrollo para frontend que incluye todas las dependencias (incluidas dev) y ejecuta `yarn dev`.
- Dependencias de frontend no utilizadas que incrementan `node_modules` y potencialmente el bundle.

Aplicando las recomendaciones priorizadas se espera una reducción sustancial del tamaño de las imágenes y del bundle final, manteniendo la funcionalidad actual.