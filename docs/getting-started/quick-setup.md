# 🚀 Quick Setup Guide (15 Minutes)

Get LeadsCRM running locally in just 15 minutes with this step-by-step guide.

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Node.js 18+** ([Download](https://nodejs.org/))
- [ ] **pnpm 9.0.0+** (`npm install -g pnpm`)
- [ ] **Git** ([Download](https://git-scm.com/))
- [ ] **PostgreSQL database** (we recommend [Supabase](https://supabase.com/))
- [ ] **Clerk account** for authentication ([Sign up](https://clerk.com/))

## ⏱️ 15-Minute Setup

### Step 1: Clone & Install (2 minutes)

```bash
# Clone the repository
git clone https://github.com/Exceptia-co/LeadsAgent.git
cd LeadsAgent

# Install all dependencies
pnpm install
```

### Step 2: Database Setup (5 minutes)

#### Option A: Supabase (Recommended)

1. Go to [Supabase](https://supabase.com/) and create a new project
2. Navigate to Settings → Database
3. Copy your connection strings:
   - `DATABASE_URL` (Transaction mode)
   - `DIRECT_URL` (Session mode)

#### Option B: Local PostgreSQL

```bash
# Create database
createdb leadcrm

# Connection string format:
# postgresql://username:password@localhost:5432/leadcrm
```

### Step 3: Authentication Setup (3 minutes)

1. Go to [Clerk Dashboard](https://dashboard.clerk.com/)
2. Create a new application
3. Copy your API keys from the API Keys section:
   - `CLERK_SECRET_KEY` (starts with `sk_test_`)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_test_`)

### Step 4: Environment Configuration (2 minutes)

```bash
# Copy environment template
cp .env.example .env

# Edit the .env file with your credentials
nano .env  # or use your preferred editor
```

**Required variables:**

```bash
# Database (from Step 2)
DATABASE_URL="postgresql://user:pass@host:5432/dbname"
DIRECT_URL="postgresql://user:pass@host:5432/dbname"

# Authentication (from Step 3)
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."

# AI Provider (choose one)
AI_PROVIDER=openrouter  # openrouter | gemini | openai
OPENROUTER_API_KEY="your_key_here"
```

### Step 5: Database Initialization (2 minutes)

```bash
# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate:dev

# (Optional) Seed sample data
pnpm db:seed
```

### Step 6: Launch Development (1 minute)

```bash
# Start all services
pnpm dev
```

**🎉 You're done!** Your services are running on:

- **Dashboard**: http://localhost:3000
- **API**: http://localhost:3003
- **WhatsApp Service**: http://localhost:3002

## ✅ Verification Steps

### 1. Check Database Connection

```bash
pnpm db:studio
```

Should open Prisma Studio at http://localhost:5555

### 2. Test API

```bash
curl http://localhost:3003/health
```

Should return: `{"status":"ok","timestamp":"..."}`

### 3. Access Dashboard

1. Go to http://localhost:3000
2. Sign up/login with Clerk
3. You should see the CRM dashboard

## 🔧 Optional: AI Setup

### OpenRouter (Recommended)

1. Sign up at [OpenRouter](https://openrouter.ai/)
2. Generate API key
3. Add to `.env`: `OPENROUTER_API_KEY="sk-or-..."`

### Google Gemini

1. Get API key from [Google AI Studio](https://makersuite.google.com/)
2. Add to `.env`: `GEMINI_API_KEY="..."`

### OpenAI

1. Get API key from [OpenAI Platform](https://platform.openai.com/)
2. Add to `.env`: `OPENAI_API_KEY="sk-..."`

## 📱 WhatsApp Setup (Optional)

1. Start WhatsApp service: `pnpm dev:whatsapp`
2. Check logs for QR code or visit http://localhost:3002/qr
3. Scan QR code with WhatsApp mobile app
4. Session will persist automatically

## 🚨 Troubleshooting

### Database Issues

```bash
# Reset database
pnpm db:reset

# Check connection
pnpm db:studio
```

### Build Issues

```bash
# Clean cache and rebuild
pnpm clean:cache
pnpm rebuild
```

### Port Conflicts

If ports are in use, you can change them in `package.json` scripts or kill existing processes:

```bash
# Kill process on port 3000
npx kill-port 3000
```

### TypeScript Errors

```bash
# Check for type errors
pnpm typecheck

# Auto-fix common issues
pnpm lint:fix
```

## 🎯 Next Steps

Now that you have LeadsCRM running:

1. **📖 Read the Documentation**: Start with [`docs/README.md`](../README.md)
2. **🎨 Explore Features**: Visit [`docs/features/README.md`](../features/README.md)
3. **🏗️ Understand Architecture**: Check [`docs/architecture/README.md`](../architecture/README.md)
4. **📋 Learn Commands**: See [`docs/reference/all-commands.md`](../reference/all-commands.md)

## 💡 Development Tips

### Essential Commands

```bash
# Development
pnpm dev                 # All services
pnpm dev:dashboard       # Dashboard only
pnpm dev:api            # API only

# Quality
pnpm lint && pnpm typecheck && pnpm test

# Database
pnpm db:studio          # Visual database editor
```

### File Structure

```
apps/
├─ dashboard/           # Next.js CRM UI
├─ api/                # NestJS backend
├─ whatsapp-service/   # WhatsApp integration
└─ docs/               # Documentation

packages/
├─ db/                 # Database schema
└─ ui/                 # Shared components
```

### Getting Help

- **Documentation**: [`docs/README.md`](../README.md)
- **Troubleshooting**: [`docs/development/TROUBLESHOOTING.md`](../development/TROUBLESHOOTING.md)
- **Issues**: [GitHub Issues](https://github.com/Exceptia-co/LeadsAgent/issues)

---

**🎊 Congratulations!** You now have a fully functional LeadsCRM system with AI-powered lead management, WhatsApp integration, and real-time analytics.
