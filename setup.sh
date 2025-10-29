#!/bin/bash
set -e

# Colors for better output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}[SETUP] Iniciando configuración del entorno del Chatbot LangChain...${NC}\n"

# Create backend .env file if it doesn't exist
if [ ! -f backend/.env ]; then
    echo -e "${YELLOW}[SETUP] Creando archivo .env del backend...${NC}"
    cp backend/.env.example backend/.env
    echo -e "${GREEN}[SETUP] Archivo .env del backend creado exitosamente. Por favor, edítalo para agregar tu clave API de OpenAI.${NC}"
else
    echo -e "${YELLOW}[SETUP] El archivo .env del backend ya existe.${NC}"
fi

# Create frontend .env file if it doesn't exist
if [ ! -f frontend/.env ]; then
    echo -e "${YELLOW}[SETUP] Creando archivo .env del frontend...${NC}"
    cp frontend/.env.example frontend/.env
    echo -e "${GREEN}[SETUP] Archivo .env del frontend creado exitosamente.${NC}"
else
    echo -e "${YELLOW}[SETUP] El archivo .env del frontend ya existe.${NC}"
fi

# Ask user if they want to use Docker or local development
echo -e "\n${YELLOW}[SETUP] ¿Deseas ejecutar la aplicación usando Docker o desarrollo local?${NC}"
echo "1) Docker Compose (recomendado)"
echo "2) Desarrollo local"
read -p "Ingresa tu elección (1 o 2): " choice

case $choice in
    1)
        echo -e "\n${GREEN}[DOCKER] Iniciando con Docker Compose...${NC}"
        if command -v docker-compose &> /dev/null; then
            docker-compose up -d
            echo -e "\n${GREEN}[DOCKER] ¡La aplicación está ejecutándose!${NC}"
            echo -e "[INFO] Frontend: http://localhost:3000"
            echo -e "[INFO] Backend API: http://localhost:8080"
            echo -e "[INFO] Documentación API: http://localhost:8080/docs"
            echo -e "\n[INFO] Para detener la aplicación, ejecuta: ${YELLOW}docker-compose down${NC}"
        else
            echo -e "${RED}[ERROR] Docker Compose no está instalado. Por favor, instala Docker y Docker Compose primero.${NC}"
            exit 1
        fi
        ;;
    2)
        echo -e "\n${GREEN}[LOCAL] Configurando para desarrollo local...${NC}"
        echo -e "\n${YELLOW}[LOCAL] Instrucciones de configuración del backend:${NC}"
        echo "[STEP] 1. cd backend"
        echo "[STEP] 2. python -m venv venv"
        echo "[STEP] 3. source venv/bin/activate  # En Windows: venv\Scripts\activate"
        echo "[STEP] 4. pip install -r requirements.txt"
        echo "[STEP] 5. python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8080"
        
        echo -e "\n${YELLOW}[LOCAL] Instrucciones de configuración del frontend:${NC}"
        echo "[STEP] 1. cd frontend"
        echo "[STEP] 2. npm install # o yarn install"
        echo "[STEP] 3. npm run dev # o yarn dev"
        ;;
    *)
        echo -e "${RED}[ERROR] Elección inválida. Saliendo.${NC}"
        exit 1
        ;;
esac

echo -e "\n${GREEN}[SETUP] ¡Configuración completada exitosamente!${NC}"