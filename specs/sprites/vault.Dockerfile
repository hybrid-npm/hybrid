FROM node:20-bookworm-slim

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --production

# Copy source
COPY vault-service.ts ./

# Create service user (non-root for security)
RUN useradd -m -s /bin/bash sprite && \
    chown -R sprite:sprite /app
USER sprite

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/status || exit 1

# Start service
CMD ["node", "vault-service.ts"]
