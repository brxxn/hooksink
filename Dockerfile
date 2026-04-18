# Stage 1: Build Svelte Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# Stage 2: Build Node Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/prisma/ ./prisma/
RUN npx prisma generate

COPY backend/ ./
RUN npm run build


# Stage 3: Production Image
FROM node:20-alpine
WORKDIR /app/backend

# Install production dependencies only to reduce surface area
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/prisma/ ./prisma/
RUN npx prisma generate

# Copy the compiled typescript files
COPY --from=backend-builder /app/backend/dist ./dist

# Copy the compiled Svelte static files to the relative path the backend expects
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Security: Run as a non-root user
RUN addgroup -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs -s /bin/sh nodejs
RUN chown -R nodejs:nodejs /app
USER nodejs

ENV NODE_ENV=production

# The startup script runs Prisma DB push, then scales up the Web Server
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
