## Build multi-stage de producción para Next.js

# Etapa 1: dependencias de producción
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=true

# Etapa 2: build con dependencias de desarrollo
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# Etapa 3: runner mínimo en producción
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
USER node
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["yarn", "start"]
