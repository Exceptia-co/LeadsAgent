# LeadsCRM – AI-Powered CRM with WhatsApp Automation

**Status:** ✅ **v2.2.0 Production Ready** - Complete operational system with PostgreSQL database, WhatsApp multi-session, AI multi-provider, and real-time analytics.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and pnpm 9.0.0+
- PostgreSQL database (Supabase recommended)
- Clerk account for authentication

### 1. Clone & Install

```bash
git clone https://github.com/Exceptia-co/LeadsAgent.git
cd LeadsAgent
pnpm install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit with your credentials (see Environment Variables section)
```

### 3. Database & Development

```bash
pnpm db:generate           # Generate Prisma client
pnpm dev                   # Start all services
```

**Service Ports:**

- Dashboard: http://localhost:3000
- API: http://localhost:3003
- WhatsApp Service: http://localhost:3002

### 4. Production Build

```bash
pnpm build                 # Full build with dependencies
pnpm test                  # Run all tests
pnpm lint && pnpm typecheck # Quality checks
```

## 🏗️ Architecture

**Turborepo Monorepo:**

```
apps/
├─ dashboard/          # Next.js 14 CRM Dashboard
├─ api/                # NestJS REST API
├─ whatsapp-service/   # WhatsApp Web.js Integration
└─ docs/               # Documentation Site

packages/
├─ db/                 # Prisma Schema & Client
├─ ui/                 # Shared React Components
└─ config-*/           # Shared ESLint/TypeScript configs
```

**Data Flow:**

```
WhatsApp ↔ WhatsApp Service ↔ NestJS API ↔ PostgreSQL
                                    ↕
                              Next.js Dashboard
```

## ⚙️ Environment Variables

**Required in `.env`:**

```bash
# Database
DATABASE_URL="postgresql://user:pass@host:5432/dbname"
DIRECT_URL="postgresql://user:pass@host:5432/dbname"

# Authentication
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."

# AI Provider (choose one)
AI_PROVIDER=openrouter  # openrouter | gemini | openai
OPENROUTER_API_KEY="..."
GEMINI_API_KEY="..."
OPENAI_API_KEY="..."
```

See `.env.example` for complete configuration.

## ✨ Key Features

- **🎯 Lead Management** - Complete CRM with lead lifecycle tracking
- **📱 WhatsApp Integration** - Multi-session support with QR codes
- **🤖 AI Multi-Provider** - OpenRouter, Gemini, OpenAI support
- **📋 Dynamic Templates** - Messages with variables ({{name}}, {{company}})
- **📊 Real-time Analytics** - Metrics, whitelist management, token usage
- **🔐 Secure Authentication** - Clerk integration with JWT
- **🧪 Full Testing** - Jest, Supertest E2E, TypeScript strict mode

## 🗄️ Database

**Active System:** 14 PostgreSQL tables with 6 active leads

- Lead management with WhatsApp authorization
- Message conversations with AI integration
- Template system with dynamic variables
- AI knowledge base and training interactions
- Session persistence and whitelist controls

## 📖 Documentation

For detailed guides, visit [`docs/README.md`](./docs/README.md)

**Quick Links:**

- [Getting Started Guide](./docs/getting-started/README.md) - Complete setup walkthrough
- [Feature Documentation](./docs/features/README.md) - All system capabilities
- [Architecture Overview](./docs/architecture/README.md) - System design
- [API Reference](./docs/reference/README.md) - Commands and endpoints

## 🔗 Useful Commands

```bash
# Development
pnpm dev                   # Start all services
pnpm dev:dashboard         # Dashboard only
pnpm dev:api              # API only

# Build & Quality
pnpm build:fast           # Parallel build
pnpm test:watch           # Watch mode testing
pnpm clean:cache          # Clean Turborepo cache

# Database
pnpm db:studio            # Prisma Studio
pnpm db:migrate:dev       # Create migration
```

## 🤝 Contributing

1. Fork and create feature branch: `feature/your-feature`
2. Add tests for new functionality
3. Run quality checks: `pnpm lint && pnpm typecheck && pnpm test`
4. Submit PR with clear description

**Commit Format:** `feat(scope): description` or `fix(scope): description`

---

**System Status:** Fully operational v2.2.0 with active database, WhatsApp sessions, and AI processing.

For issues or questions, see [Troubleshooting Guide](./docs/development/TROUBLESHOOTING.md) or open an issue.
