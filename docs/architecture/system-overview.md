# 🏗️ System Architecture Overview

LeadsCRM is built as a modern, scalable Turborepo monorepo with microservices architecture, designed for high-performance lead management with AI-powered WhatsApp automation.

## 🎯 System Design Principles

- **Monorepo Structure**: Shared packages and configurations
- **Microservices**: Independent, scalable services
- **Type Safety**: Full TypeScript implementation
- **Real-time**: Event-driven architecture
- **AI-First**: Multi-provider AI integration
- **Security**: Authentication-first design

## 🏢 High-Level Architecture

```mermaid
graph TB
    subgraph "Frontend Layer"
        D[Dashboard - Next.js 14]
        DOC[Docs Site - Next.js]
    end

    subgraph "Backend Services"
        API[API Service - NestJS]
        WS[WhatsApp Service - Express]
    end

    subgraph "External Services"
        WA[WhatsApp Web API]
        AI[AI Providers<br/>OpenRouter/Gemini/OpenAI]
        CLERK[Clerk Auth]
    end

    subgraph "Data Layer"
        DB[(PostgreSQL/Supabase)]
        REDIS[(Redis Cache)]
        FILES[File Storage]
    end

    subgraph "Shared Packages"
        PKG_DB[@leadcrm/db]
        PKG_UI[@leadcrm/ui]
        PKG_CONFIG[@leadcrm/config-*]
    end

    D --> API
    API --> DB
    API --> CLERK
    API --> AI
    WS --> WA
    WS --> API
    WS --> DB
    API --> REDIS

    D --> PKG_UI
    API --> PKG_DB
    WS --> PKG_DB

    D --> PKG_CONFIG
    API --> PKG_CONFIG
    WS --> PKG_CONFIG
```

## 📁 Monorepo Structure

### Applications (`apps/`)

```
apps/
├── dashboard/          # CRM Frontend (Port 3000)
│   ├── app/           # Next.js App Router
│   ├── components/    # React Components
│   ├── contexts/      # State Management
│   └── hooks/         # Custom Hooks
│
├── api/               # Backend API (Port 3003)
│   ├── src/
│   │   ├── auth/      # Authentication Module
│   │   ├── leads/     # Lead Management
│   │   ├── prisma/    # Database Services
│   │   └── main.ts    # NestJS Bootstrap
│   └── test/          # E2E Tests
│
├── whatsapp-service/  # WhatsApp Integration (Port 3002)
│   ├── src/
│   │   ├── controllers/  # HTTP Controllers
│   │   ├── services/    # Business Logic
│   │   ├── utils/       # Utilities
│   │   └── index.ts     # Express Bootstrap
│   └── docs/            # Service Documentation
│
└── docs/              # Documentation Site (Port 3001)
    └── app/           # Next.js Documentation
```

### Shared Packages (`packages/`)

```
packages/
├── db/                # Database Layer
│   ├── prisma/        # Schema & Migrations
│   ├── src/          # Prisma Client
│   └── scripts/      # Database Scripts
│
├── ui/               # Shared Components
│   ├── src/          # React Components
│   └── index.tsx     # Exports
│
├── config-eslint/    # ESLint Configurations
├── config-ts/        # TypeScript Configurations
└── (future packages)
```

## 🔄 Data Flow Architecture

### 1. Authentication Flow

```
User → Dashboard → Clerk → API (JWT Validation) → Protected Resources
```

### 2. Lead Management Flow

```
Dashboard → API → Database → Real-time Updates → Dashboard
```

### 3. WhatsApp Message Flow

```
WhatsApp ↔ WhatsApp Service ↔ API ↔ Database
                ↓
           AI Processing ↔ AI Providers
                ↓
           Template System → Response
```

### 4. AI Integration Flow

```
Message → WhatsApp Service → AI Provider → Response → Database → Dashboard
```

## 🚀 Service Details

### Dashboard (apps/dashboard)

- **Framework**: Next.js 14 with App Router
- **UI**: shadcn/ui + TailwindCSS
- **State**: React Context + Custom Hooks
- **Authentication**: Clerk Integration
- **Real-time**: Polling/WebSocket (planned)

**Key Features:**

- Lead management interface
- WhatsApp conversation viewer
- AI configuration dashboard
- Analytics and metrics
- Template management

### API Service (apps/api)

- **Framework**: NestJS with TypeScript
- **Database**: Prisma ORM with PostgreSQL
- **Authentication**: Clerk JWT validation
- **Validation**: class-validator DTOs
- **Testing**: Jest + Supertest

**Modules:**

- `AuthModule`: Clerk integration and JWT validation
- `LeadsModule`: Lead CRUD operations
- `MessagingModule`: WhatsApp message handling
- `AIModule`: AI provider management
- `TemplatesModule`: Dynamic template system

### WhatsApp Service (apps/whatsapp-service)

- **Framework**: Express.js with TypeScript
- **WhatsApp**: whatsapp-web.js integration
- **Sessions**: Multi-session support with persistence
- **QR Codes**: Dynamic QR generation and streaming
- **Media**: File upload and processing

**Key Features:**

- Multi-session WhatsApp connections
- QR code generation and management
- Message sending and receiving
- Media file handling
- Session persistence and recovery

## 🗄️ Database Architecture

### PostgreSQL Schema (14 Active Tables)

```sql
-- Core Entities
users                    -- Clerk user integration
leads                    -- Lead management (6 active)
messages                 -- Individual messages
whatsapp_conversations   -- Conversation threads

-- AI & Templates
ai_configuration         -- Multi-provider settings
ai_knowledge_base        -- Training data
ai_training_interactions -- Learning system
message_templates        -- Dynamic templates (3 active)
proactive_messages       -- Scheduled messages (4 active)

-- WhatsApp Management
whatsapp_sessions        -- Session persistence (1 active)
whatsapp_whitelist_logs  -- Access control

-- System
system_variables         -- Global settings (7 active)
_prisma_migrations       -- Schema versioning
```

### Key Relationships

```
User (1) → (N) Lead
Lead (1) → (N) Message
Lead (1) → (N) WhatsAppConversation
Template (1) → (N) ProactiveMessage
AIConfiguration (1) → (N) AITrainingInteraction
```

## 🤖 AI Integration Architecture

### Multi-Provider System

```
AI Service (Abstract)
├── OpenRouter Provider
├── Google Gemini Provider
└── OpenAI Provider
```

**Features:**

- Dynamic provider switching
- Fallback mechanisms
- Token usage tracking
- Response caching
- Training data collection

### AI Processing Pipeline

```
Message Input → Classification → Context Building → AI Processing → Response Generation → Storage
```

## 🔐 Security Architecture

### Authentication Layer

- **Clerk Integration**: Industry-standard auth provider
- **JWT Validation**: All API endpoints protected
- **Session Management**: Secure session handling
- **Role-based Access**: User permissions system

### Data Security

- **Input Validation**: class-validator on all inputs
- **SQL Injection**: Prisma ORM protection
- **XSS Protection**: React built-in protections
- **Environment Secrets**: Secure environment variable handling

### WhatsApp Security

- **Session Isolation**: Each session in separate container
- **Whitelist Control**: Access control for phone numbers
- **Message Encryption**: WhatsApp E2E encryption preserved

## ⚡ Performance Architecture

### Turborepo Optimizations

- **Build Caching**: Intelligent dependency caching
- **Parallel Execution**: Services build simultaneously
- **Incremental Builds**: Only changed packages rebuild
- **84% Performance Improvement**: Measured optimization gains

### Database Performance

- **Indexes**: Optimized database indexes
- **Connection Pooling**: Efficient connection management
- **Query Optimization**: Prisma query optimization
- **Caching Strategy**: Redis caching layer (planned)

### Frontend Performance

- **Next.js 14**: Latest performance optimizations
- **App Router**: Server-side rendering
- **Component Lazy Loading**: Code splitting
- **Image Optimization**: Next.js image optimization

## 🔄 Deployment Architecture

### Development Environment

```
Local Development → pnpm dev → All services on localhost
```

### Production Environment (Planned)

```
Vercel (Dashboard) + Railway (API) + Supabase (Database) + Redis (Cache)
```

### CI/CD Pipeline

```
GitHub → GitHub Actions → Build & Test → Deploy
```

## 📊 Monitoring & Observability

### Current Monitoring

- **Health Checks**: Service health endpoints
- **Error Logging**: Structured error logging
- **Performance Metrics**: Build time tracking
- **Database Monitoring**: Prisma query logging

### Planned Monitoring

- **Application Metrics**: Performance monitoring
- **Real-time Alerts**: Error notifications
- **Usage Analytics**: User behavior tracking
- **AI Metrics**: Token usage and response quality

## 🚀 Scalability Considerations

### Current Scale

- **6 Active Leads**: Operational system
- **1 WhatsApp Session**: Multi-session capable
- **14 Database Tables**: Production-ready schema
- **3 Active Templates**: Dynamic template system

### Scaling Strategy

- **Horizontal Scaling**: Multiple service instances
- **Database Sharding**: Lead-based partitioning
- **Caching Layer**: Redis for performance
- **CDN Integration**: Static asset delivery
- **WebSocket Support**: Real-time updates

## 🔮 Future Architecture

### Planned Enhancements

- **Redis Integration**: Caching and session management
- **WebSocket Support**: Real-time dashboard updates
- **Microservice Split**: Independent service deployment
- **Multi-tenant Support**: SaaS architecture
- **Advanced AI**: Machine learning pipelines

---

**Next Steps**:

- Explore [Feature Documentation](../features/README.md)
- Review [Database Schema](../reference/database-schema.md)
- Check [Deployment Guide](../deployment/README.md)
