#!/bin/bash
#
# LeadsCRM - VPS Setup Script for WhatsApp Service
# Tested on: Ubuntu 22.04 LTS / Debian 12
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Exceptia-co/LeadsAgent/main/scripts/setup-vps.sh | bash
#   OR
#   chmod +x setup-vps.sh && ./setup-vps.sh
#

set -e

echo "=============================================="
echo "  LeadsCRM - WhatsApp Service VPS Setup"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (sudo)"
    exit 1
fi

# Update system
echo ""
echo "Step 1: Updating system packages..."
apt update && apt upgrade -y
print_status "System updated"

# Install Node.js 20
echo ""
echo "Step 2: Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
    print_status "Node.js $(node -v) installed"
else
    print_warning "Node.js already installed: $(node -v)"
fi

# Install Chromium dependencies for Puppeteer
echo ""
echo "Step 3: Installing Chromium dependencies..."
apt install -y \
    gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
    libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 \
    libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
    libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation \
    libappindicator1 libnss3 lsb-release xdg-utils wget libgbm1 \
    chromium \
    --no-install-recommends

print_status "Chromium dependencies installed"

# Install pnpm and PM2 globally
echo ""
echo "Step 4: Installing pnpm and PM2..."
npm install -g pnpm pm2
print_status "pnpm $(pnpm -v) installed"
print_status "PM2 installed"

# Install Nginx
echo ""
echo "Step 5: Installing Nginx..."
apt install -y nginx
systemctl enable nginx
systemctl start nginx
print_status "Nginx installed and running"

# Install Certbot for SSL
echo ""
echo "Step 6: Installing Certbot..."
apt install -y certbot python3-certbot-nginx
print_status "Certbot installed"

# Create application directory
echo ""
echo "Step 7: Setting up application directory..."
mkdir -p /opt/leadcrm
mkdir -p /var/log/pm2
mkdir -p /opt/leadcrm/sessions
chown -R $SUDO_USER:$SUDO_USER /opt/leadcrm 2>/dev/null || true
print_status "Directories created"

# Create systemd service for PM2
echo ""
echo "Step 8: Configuring PM2 startup..."
pm2 startup systemd -u root --hp /root
print_status "PM2 startup configured"

# Print next steps
echo ""
echo "=============================================="
echo -e "${GREEN}  Setup Complete!${NC}"
echo "=============================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Clone the repository:"
echo "   git clone https://github.com/Exceptia-co/LeadsAgent.git /opt/leadcrm"
echo ""
echo "2. Configure environment:"
echo "   cd /opt/leadcrm"
echo "   cp .env.example .env"
echo "   nano .env  # Edit with production values"
echo ""
echo "3. Install dependencies and build:"
echo "   pnpm install"
echo "   pnpm db:generate"
echo "   cd apps/whatsapp-service && pnpm build"
echo ""
echo "4. Start the service:"
echo "   pm2 start ecosystem.config.js --env production"
echo "   pm2 save"
echo ""
echo "5. Configure Nginx (replace whatsapp.TUDOMINIO.com):"
echo "   nano /etc/nginx/sites-available/whatsapp-service"
echo "   ln -s /etc/nginx/sites-available/whatsapp-service /etc/nginx/sites-enabled/"
echo "   nginx -t && systemctl reload nginx"
echo ""
echo "6. Get SSL certificate:"
echo "   certbot --nginx -d whatsapp.TUDOMINIO.com"
echo ""
echo "=============================================="

# Create Nginx config template
cat > /etc/nginx/sites-available/whatsapp-service << 'EOF'
server {
    listen 80;
    server_name whatsapp.TUDOMINIO.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3002/health;
        proxy_http_version 1.1;
    }
}
EOF

print_status "Nginx config template created at /etc/nginx/sites-available/whatsapp-service"
echo ""
echo "Remember to replace 'whatsapp.TUDOMINIO.com' with your actual domain!"
echo ""
