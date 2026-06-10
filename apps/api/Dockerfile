# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN npm install

# Copy source
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Build
WORKDIR /app/apps/api
RUN npx nest build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy only production artifacts
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/packages ./packages

# Install production deps only
RUN npm install --omit=dev

EXPOSE 3001

CMD ["node", "dist/main"]
