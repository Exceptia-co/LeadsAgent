# WhatsApp Service Dockerfile
# Baileys WebSocket client -- no browser runtime dependency

FROM node:20-slim

# Create app directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files (needed for monorepo)
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./

# Copy packages (db dependency)
COPY packages/ ./packages/

# Copy whatsapp-service
COPY apps/whatsapp-service/ ./apps/whatsapp-service/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm db:generate

# Build the service
WORKDIR /app/apps/whatsapp-service
RUN pnpm build

# Create sessions directory with proper permissions
RUN mkdir -p /app/sessions && chmod 755 /app/sessions

# Create non-root user for security
RUN groupadd -r nodeuser && useradd -r -g nodeuser nodeuser \
    && chown -R nodeuser:nodeuser /app
USER nodeuser

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3002/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the service
CMD ["node", "dist/index.js"]
