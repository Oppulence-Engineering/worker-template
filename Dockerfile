# syntax=docker/dockerfile:1

# ============================================
# Base Image with Bun
# ============================================
FROM oven/bun:1.1-alpine AS base

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    ca-certificates \
    dumb-init

# ============================================
# Dependencies Stage
# ============================================
FROM base AS deps

# Copy package files
COPY package.json bun.lockb* ./

# Install production dependencies
RUN bun install --frozen-lockfile --production

# ============================================
# Builder Stage
# ============================================
FROM base AS builder

# Copy package files
COPY package.json bun.lockb* ./

# Install all dependencies (including dev)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN bun run build

# ============================================
# Production Stage
# ============================================
FROM base AS runner

# Set NODE_ENV
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S worker -u 1001 -G nodejs

# Copy production dependencies
COPY --from=deps --chown=worker:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=worker:nodejs /app/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/package.json ./package.json

# Copy migrations
COPY --chown=worker:nodejs migrations ./migrations

# Switch to non-root user
USER worker

# Expose ports
EXPOSE 8080 9090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:8080/health').then(r=>r.ok||process.exit(1)).catch(()=>process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the worker
CMD ["bun", "run", "dist/worker.js"]
