@echo off
setlocal enabledelayedexpansion

echo ================================
echo Configurando entorno de desarrollo
echo ================================

REM Ruta del entorno virtual (fuera de backend)
set VENV_DIR=..\venv3100

echo Entorno virtual: %VENV_DIR%

REM Crear entorno virtual si no existe
if not exist "%VENV_DIR%" (
    echo Creando entorno virtual con Python 3.10...
    py -3.10 -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo Error al crear el entorno virtual. Abortando.
        pause
        exit /b 1
    )
) else (
    echo Entorno virtual ya existe.
)

REM Activar entorno virtual
echo Activando entorno virtual...
call "%VENV_DIR%\Scripts\activate.bat"
if errorlevel 1 (
    echo Error al activar el entorno virtual. Abortando.
    pause
    exit /b 1
)

REM Mostrar Python y pip que se están usando
echo Python actual:
where python
python --version

echo Pip actual:
where pip
pip --version

REM Cambiar al directorio backend (donde está el requirements.txt)
cd /d "%~dp0"
echo Directorio actual: %CD%

REM Comprobar si existe requirements.txt
if not exist requirements.txt (
    echo ERROR: No se encontró requirements.txt en %CD%
    pause
    exit /b 1
)

REM Actualizar pip
echo Actualizando pip...
python -m pip install --upgrade pip

REM Instalar dependencias desde requirements.txt
echo Instalando dependencias desde requirements.txt...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR durante la instalacion de dependencias.
    pause
    exit /b 1
)

REM Verificar instalación de paquetes clave
echo Verificando instalación de paquetes clave...
for %%M in (redis langchain chromadb) do (
    python -c "import %%M" 2>nul
    if errorlevel 1 (
        echo ERROR: No se pudo importar %%M
    ) else (
        echo %%M instalado correctamente
    )
)

echo ================================
echo ¡Instalación completada!
pause