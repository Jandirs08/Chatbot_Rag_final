# Informe de Rendimiento (Frontend en Docker / Next.js Dev)

Este reporte analiza la latencia y tiempos de compilación observados al navegar por las rutas del frontend dentro de Docker.

## Resumen de Síntomas

- Advertencia: "Browserslist: browsers data (caniuse-lite) is 6 months old".
- Compilación inicial lenta por ruta (dev on-demand):
  - `/Documents`: "Compiling /Documents ..." → 12.5s (704 módulos), primera `GET` → 15644ms.
  - Compilaciones posteriores: 3.6s y 449ms; `GET` → 232ms.
  - `/chat`: "Compiling /chat ..." → 10.7s (2668 módulos), primera `GET` → 13232ms.
  - `/widget`: "Compiling /widget ..." → 3.4s (2692 módulos), `GET` → 4435ms.
- Patrón claro: primeras visitas a cada ruta son lentas; las subsiguientes mejoran drásticamente.

## Causas Probables

- Compilación bajo demanda en desarrollo (Next.js):
  - En `next dev`, cada página se compila la primera vez que se solicita; esa compilación bloquea la respuesta inicial.
  - Rutas con muchos módulos (UI libs, iconos, componentes complejos como chat) tardan más.

- Overhead por Docker en Windows:
  - Los bind mounts y el sistema de archivos de Docker Desktop (WSL2) añaden latencia de I/O y pueden ralentizar el proceso de compilación y lectura de módulos.
  - El dev server dentro del contenedor suele ser más lento que en host.

- Datos de `caniuse-lite` desactualizados:
  - Navegadores antiguos implican más polyfills y transformaciones, lo que puede incrementar el trabajo de herramientas como Autoprefixer/Babel. Actualizar la DB reduce polyfills y mejora tiempos de build.
  - Referencia: https://github.com/browserslist/update-db#readme

- Carga inicial de dependencias pesadas:
  - `chat`/`widget` reportan ~2700 módulos; esto sugiere librerías grandes y/o muchos componentes.

## Validaciones Observadas

- El patrón "compilación inicial lenta → posteriores rápidas" confirma el comportamiento on-demand típico de Next dev.
- Tras la primera compilación, las respuestas `GET` bajan a cientos de ms.

## Recomendaciones

1) Actualizar Browserslist DB (caniuse-lite):
   - Ejecutar dentro del contenedor de frontend o en el host (en `frontend/`):
     - `npx update-browserslist-db@latest`
   - Beneficios: menos polyfills innecesarios, builds más ligeros, menos trabajo en postcss/autoprefixer.

2) Probar Turbopack en desarrollo:
   - Usar `next dev --turbo` para compilar más rápido en dev.
   - Añadir script: `"dev:turbo": "next dev --turbo"` y usarlo en Docker o local.

3) Calentar rutas críticas al iniciar:
   - Automatizar un "warm-up" que haga `GET` a `/Documents`, `/chat`, `/widget` al levantar el contenedor, para precompilar y evitar esperas al primer usuario.

4) Desarrollar el frontend fuera de Docker (si es posible):
   - Iterar UI en host (Node local) y mantener backend en Docker suele reducir latencias de compilación en Windows.

5) Revisión de dependencias y módulos:
   - Verificar imports en `chat`/`widget`: 
     - Importar solo iconos necesarios (ya se hace con lucide por nombre, pero revisar que no haya imports amplios).
     - Aplicar `next/dynamic` para componentes pesados no críticos y `ssr: false` si corresponde.
     - Dividir componentes grandes y aplazar carga de partes no esenciales.

6) Recursos de Docker Desktop:
   - Asegurar que el frontend tenga CPU/RAM suficientes; aumentar límites si el dev server compite por recursos.

7) Opcionales:
   - Desactivar ciertas verificaciones pesadas en dev si no son críticas (por ejemplo, linters), asegurando que permanezcan en CI/producción.

## Pasos Inmediatos Propuestos

- Paso 1: actualizar Browserslist (en `frontend/`):
  - `npx update-browserslist-db@latest`

- Paso 2: probar Turbopack:
  - Agregar en `package.json`: `"dev:turbo": "next dev --turbo"`.
  - Ejecutar el dev server con Turbopack y medir tiempos de primera carga.

- Paso 3: añadir un pequeño script de warm-up (opcional):
  - Script que solicite `/Documents`, `/chat`, `/widget` al iniciar para precompilar.

Si quieres, puedo aplicar estos cambios (script `dev:turbo`, warm-up y ejecutar la actualización de Browserslist) y medir nuevamente los tiempos.