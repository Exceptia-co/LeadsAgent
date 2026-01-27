# 📋 Complete Command Reference

Comprehensive guide to all available commands in LeadsCRM development, production, and maintenance workflows.

## 🚀 Development Commands

### Primary Development

```bash
# Start all services in development mode
pnpm dev                    # Dashboard (3000) + API (3003) + WhatsApp (3002) + Docs (3001)

# Start individual services
pnpm dev:dashboard         # Next.js dashboard only (port 3000)
pnpm dev:api              # NestJS API only (port 3003)
pnpm dev:whatsapp         # WhatsApp service only (port 3002)
pnpm dev:docs             # Documentation site only (port 3001)
```

### Watch Mode Development

```bash
# Auto-reload development
pnpm dev:watch            # Watch mode for all services
pnpm test:watch           # Jest watch mode for tests

# Specific service watch
cd apps/dashboard && pnpm dev     # Dashboard watch mode
cd apps/api && pnpm start:dev     # API watch mode with Nest CLI
cd apps/whatsapp-service && pnpm dev  # WhatsApp service watch
```

## 🏗️ Build Commands

### Production Builds

```bash
# Standard build (respects Turborepo dependencies)
pnpm build                # Full build with dependency graph

# Optimized builds
pnpm build:fast           # Parallel build (ignores some dependencies)
pnpm build:production     # Production-optimized build with minification

# Individual service builds
pnpm build:dashboard      # Next.js production build
pnpm build:api           # NestJS production build
pnpm build:whatsapp      # WhatsApp service build
pnpm build:docs          # Documentation build
```

### Build Verification

```bash
# Preview production builds
pnpm preview              # Preview all production builds
pnpm preview:dashboard    # Preview dashboard build (usually port 4173)

# Build analysis
pnpm analyze              # Bundle size analysis
pnpm build:analyze       # Detailed build analysis
```

## 🧪 Testing Commands

### Test Execution

```bash
# Run all tests
pnpm test                 # All unit and integration tests
pnpm test:coverage        # Tests with coverage report
pnpm test:verbose         # Detailed test output

# Test types
pnpm test:unit           # Unit tests only
pnpm test:integration    # Integration tests only
pnpm test:e2e            # End-to-end tests
```

### Specific Service Testing

```bash
# API testing
cd apps/api && pnpm test                    # All API tests
cd apps/api && pnpm test:e2e               # API E2E tests
cd apps/api && pnpm test:watch             # API tests in watch mode
cd apps/api && pnpm test -- auth           # Test specific module
cd apps/api && pnpm test -- --testNamePattern="Lead" # Test specific pattern

# Dashboard testing
cd apps/dashboard && pnpm test             # Dashboard tests
cd apps/dashboard && pnpm test:coverage    # With coverage

# WhatsApp service testing
cd apps/whatsapp-service && pnpm test      # WhatsApp service tests
```

### Test Utilities

```bash
# Test database management
pnpm test:db:reset       # Reset test database
pnpm test:db:seed        # Seed test database

# Test cleanup
pnpm test:clean          # Clean test artifacts
pnpm test:clear-cache    # Clear Jest cache
```

## 🗄️ Database Commands

### Core Database Operations

```bash
# Prisma client and schema
pnpm db:generate         # Generate Prisma client (after schema changes)
pnpm db:push             # Push schema changes to database
pnpm db:pull             # Pull schema from database

# Migrations
pnpm db:migrate:dev      # Create and apply development migration
pnpm db:migrate:deploy   # Apply migrations in production
pnpm db:migrate:reset    # Reset database and apply all migrations
```

### Database Management

```bash
# Database tools
pnpm db:studio           # Open Prisma Studio (http://localhost:5555)
pnpm db:seed             # Run database seeding
pnpm db:reset            # Complete database reset

# Data operations
pnpm db:backup           # Create database backup
pnpm db:restore          # Restore from backup
pnpm db:export           # Export data to SQL/CSV
```

### Database Utilities

```bash
# Connection testing
cd packages/db && node check-system-tables.js     # Check system tables
cd packages/db && node check-data-status.js       # Check data status
cd packages/db && node count-leads.sql            # Count leads

# Data verification
cd packages/db && node verify-data.sql            # Verify data integrity
cd packages/db && node test-leads-data-fixed.sql  # Test lead data fixes
```

## 🎨 Code Quality Commands

### Linting and Formatting

```bash
# ESLint
pnpm lint                # Run ESLint on all packages
pnpm lint:fix            # Auto-fix ESLint issues
pnpm lint:check          # Check without fixing

# Prettier formatting
pnpm format              # Format all code with Prettier
pnpm format:check        # Check formatting without changes
pnpm format:fix          # Same as format
```

### Type Checking

```bash
# TypeScript checking
pnpm typecheck           # Type check all packages
pnpm typecheck:watch     # Watch mode type checking

# Individual package type checking
cd apps/dashboard && pnpm typecheck     # Dashboard types
cd apps/api && pnpm typecheck          # API types
cd apps/whatsapp-service && pnpm typecheck  # WhatsApp types
```

### Code Analysis

```bash
# Comprehensive quality check
pnpm quality             # Run lint + typecheck + format check
pnpm ci                  # CI/CD quality check (lint + typecheck + test)

# Security auditing
pnpm audit               # Check for security vulnerabilities
pnpm audit:fix           # Auto-fix security issues
```

## 🧹 Maintenance Commands

### Cache Management

```bash
# Turborepo cache
pnpm clean:cache         # Clean Turborepo build cache
pnpm clean:cache:force   # Force clean all caches

# Node modules cleanup
pnpm clean:modules       # Remove all node_modules
pnpm clean:dist          # Remove all dist/build folders
pnpm clean:all           # Complete cleanup (cache + modules + dist)
```

### Project Rebuilding

```bash
# Complete rebuild workflow
pnpm rebuild             # Clean + install + generate + build
pnpm fresh               # Complete fresh install
pnpm reset               # Reset everything to clean state

# Dependency management
pnpm install:fresh       # Fresh dependency installation
pnpm update:all          # Update all dependencies
pnpm dedupe              # Remove duplicate dependencies
```

## 📦 Package Management

### Dependency Commands

```bash
# Add dependencies
pnpm add <package>                    # Add to root
pnpm add <package> --filter dashboard # Add to specific app
pnpm add -D <package>                 # Add dev dependency
pnpm add -g <package>                 # Add globally

# Remove dependencies
pnpm remove <package>                 # Remove from root
pnpm remove <package> --filter api    # Remove from specific app

# Update dependencies
pnpm update                           # Update all dependencies
pnpm update <package>                 # Update specific package
pnpm outdated                         # Check for outdated packages
```

### Workspace Commands

```bash
# Install for all workspaces
pnpm install                          # Install all dependencies

# Run commands across workspaces
pnpm -r <command>                     # Run command in all workspaces
pnpm --filter <app> <command>         # Run command in specific app
pnpm --parallel <command>             # Run command in parallel

# Workspace information
pnpm list                             # List all packages
pnpm list --depth=0                   # Top-level packages only
pnpm why <package>                    # Show why package is installed
```

## 🚀 Production Commands

### Production Deployment

```bash
# Production build and start
pnpm build:production     # Optimized production build
pnpm start                # Start production servers
pnpm start:production     # Production start with PM2/cluster

# Individual service production
cd apps/dashboard && pnpm build && pnpm start    # Dashboard production
cd apps/api && pnpm build && pnpm start:prod     # API production
cd apps/whatsapp-service && pnpm build && pnpm start  # WhatsApp production
```

### Production Utilities

```bash
# Health checks
pnpm health               # Check all service health
pnpm health:dashboard     # Dashboard health check
pnpm health:api          # API health check
pnpm health:whatsapp     # WhatsApp service health

# Performance monitoring
pnpm monitor             # Start monitoring
pnpm logs                # View application logs
pnpm logs:api           # API logs only
pnpm logs:whatsapp      # WhatsApp service logs
```

## 🔧 Utility Commands

### Development Utilities

```bash
# Kill processes on ports
npx kill-port 3000       # Kill process on port 3000
npx kill-port 3001 3002 3003  # Kill multiple ports

# Check port usage
lsof -i :3000            # Check what's using port 3000
netstat -tulpn | grep :3000   # Alternative port check

# Environment utilities
pnpm env:check           # Validate environment variables
pnpm env:copy            # Copy .env.example to .env
```

### Code Generation

```bash
# Prisma code generation
cd packages/db && pnpm generate    # Generate Prisma client
cd packages/db && pnpm migrate     # Create new migration

# Component generation (if available)
pnpm generate:component <name>     # Generate React component
pnpm generate:api <name>           # Generate API endpoint
```

## 📊 Analytics & Monitoring

### Application Monitoring

```bash
# Performance analysis
pnpm analyze:bundle      # Bundle size analysis
pnpm analyze:deps        # Dependency analysis
pnpm analyze:types       # TypeScript analysis

# Usage statistics
pnpm stats               # Application statistics
pnpm stats:database      # Database usage stats
pnpm stats:api          # API usage stats
```

### Log Management

```bash
# View logs
pnpm logs                # All application logs
pnpm logs:error          # Error logs only
pnpm logs:access         # Access logs only

# Log utilities
pnpm logs:clear          # Clear all logs
pnpm logs:rotate         # Rotate log files
```

## 🔍 Debugging Commands

### Development Debugging

```bash
# Debug modes
pnpm dev:debug           # Start with debugging enabled
pnpm debug:api           # Debug API service
pnpm debug:whatsapp      # Debug WhatsApp service

# Inspect modes
node --inspect apps/api/dist/main.js        # Node.js inspector for API
node --inspect apps/whatsapp-service/dist/index.js  # WhatsApp inspector
```

### Troubleshooting

```bash
# System diagnostics
pnpm doctor              # Check system health
pnpm diagnose            # Run diagnostics
pnpm troubleshoot        # Troubleshooting guide

# Common fixes
pnpm fix:permissions     # Fix file permissions
pnpm fix:cache           # Fix cache issues
pnpm fix:deps            # Fix dependency issues
```

## 📱 Service-Specific Commands

### WhatsApp Service Commands

```bash
cd apps/whatsapp-service

# Session management
pnpm session:list        # List active sessions
pnpm session:clean       # Clean inactive sessions
pnpm session:backup      # Backup session data

# QR code utilities
pnpm qr:generate         # Generate QR code
pnpm qr:refresh          # Refresh QR code

# WhatsApp utilities
./send-video-example.sh  # Test video sending
pnpm test:message        # Test message sending
```

### API Service Commands

```bash
cd apps/api

# Development
pnpm start:dev           # Start in development mode
pnpm start:debug         # Start with debugging
pnpm start:prod          # Start in production mode

# Testing
pnpm test:auth           # Test authentication
pnpm test:leads          # Test leads module
pnpm test:messages       # Test messaging module
```

### Dashboard Commands

```bash
cd apps/dashboard

# Development
pnpm dev                 # Next.js development server
pnpm build               # Production build
pnpm export              # Static export

# Analysis
pnpm analyze             # Bundle analyzer
pnpm lighthouse          # Performance audit
```

## 📋 Command Combinations

### Common Workflows

```bash
# Fresh development setup
pnpm clean:all && pnpm install && pnpm db:generate && pnpm dev

# Quality check before commit
pnpm lint && pnpm typecheck && pnpm test

# Production deployment
pnpm clean:cache && pnpm build:production && pnpm test:e2e

# Database refresh
pnpm db:reset && pnpm db:seed && pnpm db:generate

# Complete system reset
pnpm clean:all && pnpm install && pnpm db:reset && pnpm db:generate && pnpm build
```

### CI/CD Pipeline Commands

```bash
# Continuous Integration
pnpm ci                  # Full CI pipeline
pnpm ci:fast             # Fast CI (parallel execution)

# Pre-deployment checks
pnpm predeploy           # Pre-deployment validation
pnpm security:check      # Security vulnerability check
```

---

## 🔗 Quick Reference

### Most Used Commands

```bash
pnpm dev                 # Start development
pnpm build               # Build for production
pnpm test                # Run tests
pnpm lint                # Check code quality
pnpm db:studio          # Open database viewer
pnpm clean:cache        # Clean build cache
```

### Emergency Commands

```bash
pnpm rebuild             # When everything breaks
pnpm clean:all          # Nuclear option - clean everything
npx kill-port 3000      # When ports are stuck
pnpm db:reset           # When database is corrupted
```

**Next Steps:**

- Bookmark this reference for daily development
- Explore [Environment Variables Guide](./environment-vars.md)
- Check [Troubleshooting Guide](../development/TROUBLESHOOTING.md)
