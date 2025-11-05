#!/bin/bash

# Crear y activar entorno virtual si no existe
if [ ! -d "../venv310" ]; then
    echo "Creando entorno virtual con Python 3.10..."
    python3.10 -m venv ../venv310
fi

# Activar entorno virtual
source ../venv310/bin/activate

# Actualizar pip
echo "Actualizando pip..."
pip install --upgrade pip

# Instalar dependencias
echo "Instalando dependencias..."
pip install -r requirements.txt

# Verificar instalación
echo "Verificando instalación..."
python -c "import redis; print('Redis instalado correctamente')"
python -c "import langchain; print('LangChain instalado correctamente')"
python -c "import chromadb; print('ChromaDB instalado correctamente')"

echo "¡Instalación completada!"