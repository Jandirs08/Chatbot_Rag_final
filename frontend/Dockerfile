# Usa imagen oficial de Node 18 basada en Alpine (sin apt)
FROM node:18-alpine

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de definición de paquetes para aprovechar cache
COPY package.json ./
COPY yarn.lock ./

# Instala dependencias
RUN yarn install --frozen-lockfile

# Copia el resto del código fuente
COPY . .

# Expone el puerto de desarrollo de Next.js
EXPOSE 3000

# Comando para iniciar el servidor de desarrollo
CMD ["yarn", "dev"]