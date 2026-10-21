# Imagen genérica para cualquier pieza del sistema (gateway | catalog | booking | payments | identity).
# Contexto de build: la RAÍZ del repo (necesita contracts/ y services/).
#   docker build -f services/Dockerfile --build-arg APP=catalog -t rodadoec-catalog .
FROM node:20-alpine AS build
ARG APP
WORKDIR /app/services
COPY services/package*.json ./
RUN npm ci
COPY services/ ./
RUN npx nest build ${APP}

FROM node:20-alpine AS runtime
ARG APP
ENV NODE_ENV=production APP=${APP} PROTO_DIR=/app/contracts/proto
WORKDIR /app/services
COPY services/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/services/dist ./dist
COPY contracts/ /app/contracts/
EXPOSE 3000
CMD node dist/apps/${APP}/apps/${APP}/src/main.js
