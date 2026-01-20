# WhatsApp Service Dockerfile
# Optimized for Puppeteer/Chromium with WhatsApp Web.js

FROM node:20-slim

# Install Chromium dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

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
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && chown -R pptruser:pptruser /app
USER pptruser

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3002/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the service
CMD ["node", "dist/index.js"]
