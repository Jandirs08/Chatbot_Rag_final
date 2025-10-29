# 🚀 Guía de Inicio Rápido con Docker (Entorno de Desarrollo)

Esta guía explica cómo configurar y ejecutar el proyecto Chatbot RAG en un entorno de desarrollo local utilizando Docker y Docker Compose.

Este setup está optimizado para el desarrollo, con **hot-reloading** habilitado tanto para el backend como para el frontend. Esto significa que cualquier cambio que hagas en el código se reflejará automáticamente en los contenedores en ejecución sin necesidad de reconstruir las imágenes.

## ✅ Prerrequisitos

- **Docker**: Asegúrate de tener Docker instalado y en ejecución en tu sistema.
- **Docker Compose**: Generalmente viene incluido con Docker Desktop.
- **Git**: Para clonar el repositorio.

## ⚙️ Configuración Inicial

Antes de levantar los servicios, necesitas configurar las variables de entorno.

1.  **Clonar el repositorio** (si aún no lo has hecho):

    ```bash
    git clone [URL_DEL_REPO]
    cd [NOMBRE_DEL_PROYECTO]
    ```

2.  **Configurar el Backend**:

    - Navega a la carpeta `backend`.
    - Copia el archivo de ejemplo `.env.example` a un nuevo archivo llamado `.env`.
      ```bash
      cp backend/.env.example backend/.env
      ```
    - Abre `backend/.env` y añade tus claves de API (como `OPENAI_API_KEY`) y cualquier otra configuración que necesites.

3.  **Configurar el Frontend**:
    - El frontend no requiere un archivo `.env` para este setup de Docker, ya que la URL del backend se configura directamente en `docker-compose.yml`.

## 🚀 Levantar el Entorno

Una vez configurado, puedes iniciar todos los servicios con un solo comando desde la raíz del proyecto:

```bash
docker-compose up --build
```

- `up`: Crea e inicia los contenedores.
- `--build`: Fuerza la reconstrucción de las imágenes si los `Dockerfile` o los archivos de dependencias (`requirements.txt`, `package.json`) han cambiado.

Verás los logs de todos los servicios (MongoDB, Backend, Frontend) en tu terminal.

## 🌐 Acceder a la Aplicación

- **Frontend (Interfaz de Chat)**: http://localhost:3000
- **Backend (API Docs)**: http://localhost:8000/docs
- **Base de Datos (MongoDB)**: Accesible en el puerto `27018` desde tu máquina local.

## 🛑 Detener el Entorno

Para detener todos los contenedores, presiona `Ctrl + C` en la terminal donde ejecutaste `docker-compose up`.

Si quieres detenerlos y eliminar los contenedores (pero no los volúmenes de datos), puedes ejecutar:

```bash
docker-compose down
```
