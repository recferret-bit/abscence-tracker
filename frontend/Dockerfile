# syntax=docker/dockerfile:1.6

# ---------- Build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src

# Same-origin /api proxy is provided by nginx, so VITE_API_URL stays default.
ENV VITE_API_URL=/api
RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
