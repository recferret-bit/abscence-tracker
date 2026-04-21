# syntax=docker/dockerfile:1.6

# ---------- Build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
# Prisma 7 loads prisma.config.ts during `prisma generate`, which requires DATABASE_URL.
# Provide a build-time fallback so client generation can run without runtime secrets.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate

COPY src ./src
COPY test ./test

RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY prisma.config.ts ./

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && node dist/src/main.js"]
