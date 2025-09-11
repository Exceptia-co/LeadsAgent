# ⚙️ Environment Variables Complete Guide

Comprehensive reference for all environment variables used across LeadsCRM services. This guide covers required, optional, and service-specific configuration.

## 🚨 Critical Requirements

Before starting, ensure you have:

- **PostgreSQL Database** (Supabase recommended)
- **Clerk Authentication Account**
- **AI Provider API Key** (OpenRouter/Gemini/OpenAI)

## 🗄️ Database Configuration

### Required Variables

```bash
# PostgreSQL Connection (Supabase/PostgreSQL)
DATABASE_URL="postgresql://user:password@host:port/database"
DIRECT_URL="postgresql://user:password@host:port/database"
```

### Supabase Setup

```bash
# Supabase Configuration (if using Supabase)
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Connection URLs
DATABASE_URL="postgresql://postgres.xxxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.xxxxx:password@aws-0-us-east-1.compute-1.amazonaws.com:5432/postgres"
```

**Important Notes:**

- `DATABASE_URL`: Uses pooler for application connections (port 6543)
- `DIRECT_URL`: Direct connection for migrations (port 5432)
- Never use pooler for Prisma migrations

### Local PostgreSQL Setup

```bash
# Local PostgreSQL (alternative to Supabase)
DATABASE_URL="postgresql://username:password@localhost:5432/leadcrm"
DIRECT_URL="postgresql://username:password@localhost:5432/leadcrm"
```

## 🔐 Authentication (Clerk)

### Required Clerk Variables

```bash
# Clerk Authentication
CLERK_SECRET_KEY="sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
CLERK_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Clerk URL Configuration

```bash
# Authentication URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/dashboard"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/dashboard"
```

### How to Get Clerk Keys

1. Sign up at [Clerk Dashboard](https://dashboard.clerk.com/)
2. Create new application
3. Navigate to **API Keys** section
4. Copy **Secret Key** and **Publishable Key**
5. Set up webhooks for **Webhook Secret**

## 🤖 AI Provider Configuration

### Multi-Provider Setup

```bash
# AI Provider Selection
AI_PROVIDER="openrouter"  # openrouter | gemini | openai

# OpenRouter (Recommended)
OPENROUTER_API_KEY="sk-or-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
OPENROUTER_MODEL="openai/gpt-4o-mini"
OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"

# Google Gemini
GEMINI_API_KEY="AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
GEMINI_MODEL="gemini-1.5-pro"

# OpenAI
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
OPENAI_MODEL="gpt-4o-mini"
OPENAI_BASE_URL="https://api.openai.com/v1"
```

### AI Provider Details

#### OpenRouter (Recommended)

- **Access**: Multiple AI models through single API
- **Cost**: Pay-per-use with competitive pricing
- **Models**: GPT-4, Claude, Llama, and more
- **Setup**: [OpenRouter.ai](https://openrouter.ai/) → API Keys

#### Google Gemini

- **Access**: Google's advanced language model
- **Cost**: Generous free tier
- **Models**: Gemini Pro, Gemini Pro Vision
- **Setup**: [Google AI Studio](https://makersuite.google.com/)

#### OpenAI

- **Access**: Direct OpenAI API access
- **Cost**: OpenAI pricing structure
- **Models**: GPT-4, GPT-3.5-turbo, GPT-4-turbo
- **Setup**: [OpenAI Platform](https://platform.openai.com/)

## 📱 WhatsApp Service Configuration

### Core WhatsApp Variables

```bash
# WhatsApp Service
WHATSAPP_SERVICE_URL="http://localhost:3002"
WHATSAPP_SERVICE_PORT=3002
WHATSAPP_WEBHOOK_SECRET="your_secure_webhook_secret"
WHATSAPP_SESSION_DIR="./.wwebjs_sessions"

# Webhook Configuration
WEBHOOK_URL="http://localhost:3003/api/webhooks/whatsapp"
```

### Session Management

```bash
# Session Configuration
WHATSAPP_SESSION_NAME="default"
WHATSAPP_HEADLESS=true
WHATSAPP_CACHE_ENABLED=true
WHATSAPP_TIMEOUT=60000
```

### Message Configuration

```bash
# Message Settings
WHATSAPP_MAX_MESSAGE_LENGTH=4096
WHATSAPP_TYPING_DELAY=1000
WHATSAPP_RETRY_ATTEMPTS=3
WHATSAPP_RETRY_DELAY=5000
```

## 🌐 Service Ports & URLs

### Development Ports

```bash
# Service Ports
DASHBOARD_PORT=3000
DOCS_PORT=3001
WHATSAPP_PORT=3002
API_PORT=3003

# Service URLs
NEXT_PUBLIC_API_URL="http://localhost:3003"
NEXT_PUBLIC_WHATSAPP_URL="http://localhost:3002"
NEXT_PUBLIC_DOCS_URL="http://localhost:3001"
```

### Production URLs

```bash
# Production Configuration
NEXT_PUBLIC_API_URL="https://api.yourdomainï.com"
NEXT_PUBLIC_WHATSAPP_URL="https://whatsapp.yourdomain.com"
NEXTAUTH_URL="https://yourdomain.com"
```

## 🔒 Security Configuration

### Authentication Security

```bash
# JWT Configuration
JWT_SECRET="your_super_secure_jwt_secret_at_least_32_chars"
JWT_EXPIRES_IN="7d"

# Session Security
NEXTAUTH_SECRET="your_nextauth_secret_32_chars_minimum"
SESSION_MAX_AGE=604800  # 7 days in seconds

# Encryption
ENCRYPTION_KEY="your_32_character_encryption_key_here"
```

### CORS & Security Headers

```bash
# CORS Configuration
CORS_ORIGIN="http://localhost:3000,http://localhost:3003"
CORS_CREDENTIALS=true

# Security Headers
SECURITY_CONTENT_SECURITY_POLICY=true
SECURITY_HSTS=true
SECURITY_NO_SNIFF=true
```

### Rate Limiting

```bash
# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS=false
```

## 📊 Logging & Monitoring

### Application Logging

```bash
# Logging Configuration
LOG_LEVEL="info"  # debug | info | warn | error
LOG_FORMAT="combined"  # combined | dev | common | short | tiny
LOG_FILE_ENABLED=true
LOG_FILE_PATH="./logs/app.log"
LOG_MAX_SIZE="10m"
LOG_MAX_FILES="5"
```

### Debug Configuration

```bash
# Debug Settings
DEBUG="leadcrm:*"
NODE_ENV="development"  # development | production | test
VERBOSE_LOGGING=false
```

## 🎯 Feature Flags

### AI Features

```bash
# AI Feature Controls
AI_ENABLED=true
AI_AUTO_CLASSIFICATION=true
AI_RESPONSE_GENERATION=true
AI_LEARNING_MODE=true
AI_FALLBACK_ENABLED=true
```

### WhatsApp Features

```bash
# WhatsApp Feature Controls
WHATSAPP_AUTO_REPLY=true
WHATSAPP_MEDIA_ENABLED=true
WHATSAPP_GROUP_SUPPORT=false
WHATSAPP_STATUS_UPDATES=true
```

### Dashboard Features

```bash
# Dashboard Features
ANALYTICS_ENABLED=true
REAL_TIME_UPDATES=true
EXPORT_ENABLED=true
BULK_OPERATIONS=true
```

## 🚀 Performance Optimization

### Caching Configuration

```bash
# Redis Cache (Optional)
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=""
REDIS_DB=0
CACHE_TTL=3600  # 1 hour
CACHE_ENABLED=true
```

### Database Performance

```bash
# Database Connection Pool
DATABASE_POOL_SIZE=10
DATABASE_TIMEOUT=30000
DATABASE_IDLE_TIMEOUT=10000
```

### Build Optimization

```bash
# Build Configuration
TURBO_CACHE_ENABLED=true
TURBO_REMOTE_CACHE=false
BUILD_ANALYZE=false
COMPRESS_ASSETS=true
```

## 🧪 Testing Configuration

### Test Environment

```bash
# Test Database
TEST_DATABASE_URL="postgresql://test_user:test_pass@localhost:5432/leadcrm_test"

# Test Configuration
NODE_ENV="test"
JEST_TIMEOUT=30000
TEST_PARALLEL=true
COVERAGE_THRESHOLD=80
```

### E2E Testing

```bash
# End-to-End Testing
E2E_BASE_URL="http://localhost:3000"
E2E_API_URL="http://localhost:3003"
E2E_HEADLESS=true
E2E_TIMEOUT=60000
```

## 📱 Mobile & PWA Configuration

### Progressive Web App

```bash
# PWA Configuration
PWA_ENABLED=true
PWA_OFFLINE_SUPPORT=true
PWA_PUSH_NOTIFICATIONS=true

# Mobile Optimization
MOBILE_RESPONSIVE=true
TOUCH_GESTURES=true
```

## 🌍 Internationalization

### Language Configuration

```bash
# i18n Configuration
DEFAULT_LOCALE="en"
SUPPORTED_LOCALES="en,es,fr,de"
LOCALE_DETECTION=true
```

## 📋 Environment File Templates

### Minimal Production (.env.production)

```bash
# Essential Production Variables
NODE_ENV=production
DATABASE_URL="postgresql://prod_user:prod_pass@prod_host:5432/leadcrm"
DIRECT_URL="postgresql://prod_user:prod_pass@prod_host:5432/leadcrm"
CLERK_SECRET_KEY="sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
AI_PROVIDER="openrouter"
OPENROUTER_API_KEY="sk-or-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
JWT_SECRET="your_production_jwt_secret_32_chars_min"
NEXTAUTH_SECRET="your_production_nextauth_secret_32"
NEXT_PUBLIC_API_URL="https://api.yourdomain.com"
```

### Development (.env.development)

```bash
# Development Environment
NODE_ENV=development
DATABASE_URL="postgresql://dev_user:dev_pass@localhost:5432/leadcrm_dev"
DIRECT_URL="postgresql://dev_user:dev_pass@localhost:5432/leadcrm_dev"
CLERK_SECRET_KEY="sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
AI_PROVIDER="openrouter"
OPENROUTER_API_KEY="sk-or-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
LOG_LEVEL="debug"
DEBUG="leadcrm:*"
```

### Testing (.env.test)

```bash
# Testing Environment
NODE_ENV=test
DATABASE_URL="postgresql://test_user:test_pass@localhost:5432/leadcrm_test"
DIRECT_URL="postgresql://test_user:test_pass@localhost:5432/leadcrm_test"
AI_PROVIDER="mock"
LOG_LEVEL="error"
JEST_TIMEOUT=30000
```

## 🔍 Environment Validation

### Validation Script

```bash
# Check required environment variables
pnpm env:check

# Copy template to environment file
cp .env.example .env
```

### Required Variable Checklist

- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `DIRECT_URL` - Direct PostgreSQL connection (for migrations)
- [ ] `CLERK_SECRET_KEY` - Clerk authentication secret
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- [ ] `AI_PROVIDER` - AI provider selection
- [ ] AI Provider API Key (OpenRouter/Gemini/OpenAI)

### Optional but Recommended

- [ ] `REDIS_URL` - For caching and performance
- [ ] `WHATSAPP_WEBHOOK_SECRET` - For WhatsApp security
- [ ] `JWT_SECRET` - For enhanced security
- [ ] `LOG_LEVEL` - For appropriate logging

## 🚨 Security Best Practices

### Secret Management

1. **Never commit secrets** to version control
2. **Use different secrets** for each environment
3. **Rotate secrets regularly** in production
4. **Use strong passwords** (minimum 32 characters)
5. **Enable 2FA** for all service accounts

### Environment File Security

```bash
# Secure file permissions
chmod 600 .env
chmod 600 .env.production
chmod 600 .env.local

# Add to .gitignore (already included)
.env
.env.*
!.env.example
```

## 🔗 External Service Setup Links

### Quick Setup Links

- [Supabase](https://supabase.com/) - Database hosting
- [Clerk](https://clerk.com/) - Authentication
- [OpenRouter](https://openrouter.ai/) - AI models
- [Google AI Studio](https://makersuite.google.com/) - Gemini API
- [OpenAI Platform](https://platform.openai.com/) - OpenAI API

### Documentation References

- [Prisma Environment Variables](https://www.prisma.io/docs/guides/development-environment/environment-variables)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [Clerk Configuration](https://clerk.com/docs/reference/environment-variables)

---

## 🎯 Quick Start Checklist

1. **Copy template**: `cp .env.example .env`
2. **Set database**: Configure `DATABASE_URL` and `DIRECT_URL`
3. **Configure Clerk**: Set `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
4. **Choose AI provider**: Set `AI_PROVIDER` and corresponding API key
5. **Validate setup**: `pnpm env:check`
6. **Generate database**: `pnpm db:generate`
7. **Start development**: `pnpm dev`

**Next Steps:**

- Review [Quick Setup Guide](../getting-started/quick-setup.md)
- Check [Security Guide](../deployment/security-guide.md)
- Explore [Troubleshooting](../development/TROUBLESHOOTING.md)
