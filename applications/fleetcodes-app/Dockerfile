# Multi-stage Dockerfile for React/Vite application

# Build stage
FROM node:20 AS builder

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy source code
COPY fleetcodes-app/ ./

# Install dependencies and build the application
RUN rm -rf node_modules pnpm-lock.yaml package-lock.json yarn.lock
RUN pnpm install && ROLLUP_PURE=true pnpm run build

# Production stage
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Use custom nginx config to listen on port 8000
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 8000
EXPOSE 8000

# Start nginx
CMD [""nginx", "-g", "daemon off;""]
