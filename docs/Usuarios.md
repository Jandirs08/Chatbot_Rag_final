


          
Voy a revisar el docker-compose para identificar el servicio de MongoDB y su puerto.
        
            
toolName: view_files
            
status: success
          
            
filePath: c:\Chatbot\Chatbot_Rag_final\docker-compose.yml
          
Aquí tienes un flujo claro para consultar, limpiar y recrear usuarios usando tu entorno con Docker.

**Conexión**
- Servicio MongoDB: `chatbot-mongodb-dev` (puerto local `27018` → contenedor `27017`)
- URI local para acceder: `mongodb://localhost:27018/chatbot_rag_db`
- Ver contenedores: `docker compose ps`

**Listar usuarios**
- Con `mongosh` dentro del contenedor:
  - `docker exec -it chatbot-mongodb-dev mongosh --quiet --eval "db.getSiblingDB('chatbot_rag_db').users.find({}, {username:1,email:1,is_admin:1,is_active:1,created_at:1}).toArray()"`
- Si `mongosh` no está disponible, prueba `mongo`:
  - `docker exec -it chatbot-mongodb-dev mongo --quiet --eval "db.getSiblingDB('chatbot_rag_db').users.find({}, {username:1,email:1,is_admin:1,is_active:1,created_at:1}).toArray()"`
- Desde tu máquina (si tienes `mongosh` instalado):
  - `mongosh "mongodb://localhost:27018/chatbot_rag_db" --eval "db.users.find({}, {username:1,email:1,is_admin:1,is_active:1,created_at:1}).toArray()"`

**Limpiar usuarios**
- Borrar todos los documentos de la colección `users`:
  - `docker exec -it chatbot-mongodb-dev mongosh --quiet --eval "db.getSiblingDB('chatbot_rag_db').users.deleteMany({})"`
- Alternativa (más radical): eliminar la colección entera
  - `docker exec -it chatbot-mongodb-dev mongosh --quiet --eval "db.getSiblingDB('chatbot_rag_db').users.drop()"`
  - Nota: eliminar la colección borra índices; tu script de creación crea índices mínimos si no existen.

**Crear usuario admin**
- Asegúrate de tener dependencias (si usas el script): `pip install pymongo bcrypt`
- Ejecuta el script desde la raíz del repo:
  - `python docs/crear_usuario_admin.py --email admin@example.com --password "Admin123!" --username admin --full-name "Administrador"`
- El script por defecto apunta a `mongodb://localhost:27018/chatbot_rag_db`. Si necesitas otro origen:
  - `python docs/crear_usuario_admin.py --mongo-uri "mongodb://localhost:27018/chatbot_rag_db" --email ... --password ... --username ...`
- Si el usuario ya existe y quieres actualizar contraseña y elevar a admin:
  - `python docs/crear_usuario_admin.py --email admin@example.com --password "NuevaPass123!" --username admin --force-update`

**Verificación**
- Lista de nuevo los usuarios para confirmar que el admin se creó:
  - `docker exec -it chatbot-mongodb-dev mongosh --quiet --eval "db.getSiblingDB('chatbot_rag_db').users.find({}, {username:1,email:1,is_admin:1,is_active:1,created_at:1}).toArray()"`

**Notas rápidas**
- Ejecuta los comandos desde `c:\Chatbot\Chatbot_Rag_final`.
- Si tienes problemas con `bcrypt` o `pymongo`, instala: `pip install pymongo bcrypt`.
- En el contenedor, el backend usa `MONGO_URI=mongodb://mongodb:27017/chatbot_rag_db`; desde tu host, usa `mongodb://localhost:27018/chatbot_rag_db`.

Si quieres, puedo ejecutar por ti el listado primero y luego proceder con la limpieza y creación usando valores que me indiques para email/contraseña. ¿Qué credenciales quieres para el usuario admin?
        