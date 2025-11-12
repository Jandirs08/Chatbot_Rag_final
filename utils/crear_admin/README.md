# Crear usuario administrador (interactivo)

Este script crea o eleva un usuario administrador directamente en MongoDB.
Solicita por consola el email y la contraseña, aplica hash con bcrypt (o el
hash del backend si está disponible) y asegura índices básicos.

## Requisitos
- Python 3.10+
- Dependencias:
  - Opción rápida: `pip install -r backend/requirements.txt`
  - O bien: `pip install pymongo bcrypt`

## Configuración de la conexión
- Usa la variable `MONGODB_URI` (preferida) o `MONGO_URI` (fallback).
- Si tu `docker-compose.yml` está corriendo localmente, la URI suele ser:
  `mongodb://localhost:27018/chatbot_rag_db`

### Ejemplos (Windows PowerShell)
- Preparar URI local (docker):
  ```powershell
  $env:MONGODB_URI = "mongodb://localhost:27018/chatbot_rag_db"
  ```

## Ejecución
Desde la raíz del proyecto:
```powershell
python utils/crear_admin/crear_admin.py
```

Sigue los prompts:
- Ingresa el `email` del usuario admin
- Ingresa la `contraseña` (se validará: mínimo 8, una mayúscula y un caracter especial)
- Opcionalmente ingresa el `nombre completo`
- Si el usuario ya existe por email, el script lo elevará a admin y te preguntará
  si deseas actualizar la contraseña.

## Notas
- El script intenta usar `backend.auth.password_handler` para el hash y, si no está disponible,
  usa `bcrypt` directamente.
- Los índices de la colección `users` (`username`, `email`, `is_active`) se aseguran automáticamente.
- Si tu URI incluye la base de datos, se usará esa; de lo contrario, se tomará de
  `MONGO_DATABASE_NAME` o se usará `chatbot_rag_db` por defecto.