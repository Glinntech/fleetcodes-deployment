# Dependencies stage
FROM --platform=linux/arm64 node:18-alpine AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Builder dependencies stage
FROM --platform=linux/arm64 node:18-alpine AS builder-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Builder stage
FROM --platform=linux/arm64 node:18-alpine AS builder
WORKDIR /app

# Copy dependencies (including dev dependencies needed for build)
COPY --from=builder-deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM --platform=linux/arm64 node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the public folder
COPY --from=builder /app/public ./public

# Copy the built application - use regular Next.js output since standalone might not be configured
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

# Copy production dependencies
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application using Next.js start
CMD ["npm", "start"]
