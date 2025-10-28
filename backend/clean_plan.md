# Plan de Limpieza del Backend

## 1. Archivos a Eliminar

Los siguientes archivos en la carpeta `dev/` son seguros para eliminar, ya que no son importados por ninguna parte del código principal:

```bash
rm backend/dev/redis_check.py
rm backend/dev/load_test.py
rm backend/dev/cache_test.py
rm backend/dev/performance_test.py
rm backend/dev/add_test_docs.py
```

## 2. Dependencias a Desinstalar

Las siguientes dependencias no se utilizan en el código principal y pueden ser desinstaladas:

```bash
pip uninstall -y Faker
```

## 3. Dependencias a Conservar (Falsos Positivos)

Las siguientes dependencias deben conservarse:

- `xlsxwriter`: Se utiliza en `backend/api/routes/chat/chat_routes.py` para generar archivos Excel.
- `unstructured-inference` y `pi-heif`: Son dependencias indirectas de `unstructured` utilizadas para procesar tipos específicos de archivos.

## 4. Dependencias que Requieren Verificación Adicional

Las siguientes dependencias requieren una verificación más profunda antes de tomar una decisión:

- `presidio-analyzer` y `presidio-anonymizer`: Mencionadas en el README como parte de la funcionalidad de anonimización, pero no se encontraron importaciones directas.
- `langdetect`: Mencionada en el README para soporte multilingüe, pero no se encontraron importaciones directas.
- `opentelemetry-instrumentation-fastapi`: Podría estar configurada en archivos de inicio o configuración sin importaciones directas.

## Comandos de Limpieza Recomendados

Para ejecutar la limpieza de forma segura, se recomienda seguir estos pasos:

1. Hacer una copia de seguridad del proyecto:
```bash
cp -r backend backend_backup
```

2. Eliminar los archivos de desarrollo no utilizados:
```bash
rm backend/dev/redis_check.py
rm backend/dev/load_test.py
rm backend/dev/cache_test.py
rm backend/dev/performance_test.py
rm backend/dev/add_test_docs.py
```

3. Desinstalar dependencias no utilizadas:
```bash
pip uninstall -y Faker
```

4. Verificar que la aplicación sigue funcionando correctamente después de estos cambios.

5. Para una limpieza más agresiva (solo después de verificación adicional):
```bash
# Solo si se confirma que no se utilizan:
# pip uninstall -y presidio-analyzer presidio-anonymizer langdetect opentelemetry-instrumentation-fastapi
```