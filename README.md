# 🤖 Chatbot RAG LangChain

[![build](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/usuario/repo)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![version](https://img.shields.io/badge/version-1.0.0-informational)](https://github.com/usuario/repo)

## 📖 Descripción del Proyecto

Este proyecto implementa un chatbot avanzado con capacidades RAG (Retrieval Augmented Generation) que permite consultar documentos PDF y obtener respuestas contextualizadas utilizando modelos de lenguaje de última generación.

## ✨ Features Principales

* **Procesamiento de Lenguaje Natural (PLN)** para entender consultas complejas del usuario
* **Arquitectura RAG (Retrieval Augmented Generation)** para respuestas basadas en documentos
* **Procesamiento y análisis de documentos PDF** con extracción inteligente de contenido
* **Integración con OpenAI y modelos de Hugging Face** para generación de respuestas
* **Almacenamiento vectorial de documentos** para búsqueda semántica eficiente
* **Memoria de conversación** para mantener contexto entre interacciones
* **Interfaz web moderna y responsiva** con React y Tailwind CSS
* **API RESTful** para integración con otros sistemas
* **Soporte multilingüe** con detección automática de idioma
* **Anonimización de datos sensibles** mediante presidio-analyzer/anonymizer

## 🛠️ Stack Tecnológico

### Frontend
* **Framework**: Next.js 14.1.0 (React 18)
* **Estilos**: Tailwind CSS, Chakra UI, Radix UI
* **Estado y Comunicación**: React Hooks, fetch-event-source
* **Renderizado de Markdown**: marked, highlight.js
* **Animaciones**: Framer Motion
* **Tipado**: TypeScript

### Backend
* **Framework**: FastAPI (Python)
* **Procesamiento de Lenguaje**: LangChain, LangSmith
* **Modelos de IA**: OpenAI, Hugging Face
* **Procesamiento de PDF**: pdfminer.six, unstructured, pytesseract, pdf2image
* **OCR**: pytesseract, OpenCV

### Base de Datos
* **Vectorial**: ChromaDB
* **Documentos**: MongoDB (motor, pymongo)
* **Caché**: Redis

### Seguridad
* **Autenticación**: python-jose, passlib
* **Protección de datos**: presidio-analyzer, presidio-anonymizer

### Despliegue
* **Contenedores**: Docker, Docker Compose
* **Monitoreo**: Prometheus, OpenTelemetry

## 🏛️ Arquitectura

Este proyecto sigue una arquitectura de microservicios con separación clara entre frontend y backend:

* **Frontend**: Aplicación Next.js que proporciona la interfaz de usuario y gestiona la interacción con el usuario.
* **Backend**: API FastAPI que implementa:
  * Servicio de chat con memoria de conversación
  * Servicio RAG para procesamiento y consulta de documentos
  * Gestión de documentos PDF
  * Vectorización y almacenamiento de embeddings

La arquitectura RAG (Retrieval Augmented Generation) permite al chatbot buscar información relevante en documentos PDF procesados y utilizarla para generar respuestas precisas y contextualizadas.

[POR COMPLETAR: Si es relevante, añade un diagrama simple en ASCII o un enlace a un diagrama.]

## 🚀 Instalación y Puesta en Marcha

### Prerrequisitos

* Python 3.10+
* Node.js 18.x+
* Docker y Docker Compose
* MongoDB
* Redis
* Tesseract OCR (para procesamiento de PDF con imágenes)

### 1. Clonar el Repositorio

```bash
git clone [URL_DEL_REPO]
cd Chatbot_Rag_final
```

### 2. Configurar el Backend

```bash
# Crear entorno virtual (Windows)
python -m venv venv
.\venv\Scripts\activate

# Instalar dependencias
cd backend
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus claves de API y configuraciones
```

### 3. Configurar el Frontend

```bash
cd frontend
npm install
# o si prefieres yarn
yarn install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con la URL del backend y otras configuraciones
```

### 4. Iniciar los Servicios con Docker (Opcional)

```bash
# En la raíz del proyecto
docker-compose up -d
```

### 5. Iniciar el Backend (Desarrollo)

```bash
cd backend
uvicorn main:app --reload
```

### 6. Iniciar el Frontend (Desarrollo)

```bash
cd frontend
npm run dev
# o con yarn
yarn dev
```

### 7. Acceder a la Aplicación

* Frontend: http://localhost:3000
* API Backend: http://localhost:8000
* Documentación API: http://localhost:8000/docs

## 📚 Uso del Chatbot

1. **Subir Documentos**: Navega a la sección de documentos y sube los archivos PDF que deseas consultar.
2. **Procesar Documentos**: El sistema procesará automáticamente los documentos y los indexará para búsqueda.
3. **Iniciar Conversación**: Ve a la interfaz de chat y comienza a hacer preguntas relacionadas con los documentos.
4. **Consultas Avanzadas**: Puedes hacer preguntas específicas sobre el contenido de los documentos y el chatbot recuperará la información relevante.

## 🧪 Pruebas

```bash
# Ejecutar pruebas del backend
cd backend
pytest

# Ejecutar pruebas del frontend
cd frontend
npm test
```

## 🔧 Configuración Avanzada

El proyecto permite configurar múltiples aspectos a través de variables de entorno:

* **Modelos de IA**: Configura qué modelos de OpenAI o Hugging Face utilizar
* **Parámetros de RAG**: Ajusta el tamaño de chunks, overlap, y estrategias de recuperación
* **Memoria de Conversación**: Configura el tipo de memoria y su persistencia
* **Caché**: Ajusta la configuración de Redis para optimizar el rendimiento

Consulta los archivos `.env.example` tanto en el backend como en el frontend para ver todas las opciones disponibles.

## 🤝 Contribución

[POR COMPLETAR: Añade instrucciones específicas para contribuir al proyecto, como convenciones de código, proceso de pull request, etc.]

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 👥 Autores

[POR COMPLETAR: Añade información sobre los autores y contribuidores del proyecto.]