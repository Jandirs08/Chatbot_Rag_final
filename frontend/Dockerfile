# Usa una imagen base de Node.js ligera (alpine)
FROM node:20-alpine

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de definición de paquetes para instalar dependencias
# Esto aprovecha el cache de capas de Docker
COPY package.json ./
COPY package-lock.json ./

# Instala las dependencias de npm
RUN npm install

# Expone el puerto de desarrollo de Next.js
EXPOSE 3000