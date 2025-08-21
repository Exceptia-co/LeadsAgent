# LeadsCRM - Sistema CRM con Automatización de WhatsApp

## 🚀 Descripción

LeadsCRM es una plataforma CRM moderna y completa que incluye automatización de WhatsApp, desarrollada con arquitectura de monorepo usando Turborepo. El sistema permite gestionar leads, automatizar comunicaciones por WhatsApp y realizar seguimiento completo de conversaciones en tiempo real.

## ✨ Características Principales

- **📊 Dashboard CRM Completo** - Gestión de leads, métricas y analytics
- **📱 Integración WhatsApp** - Automatización completa con whatsapp-web.js
- **💬 Chat en Tiempo Real** - Interface de conversaciones con envío de mensajes
- **🔐 Autenticación Completa** - Sistema de login/logout seguro
- **⚡ Performance Optimizada** - Build ultra-rápido con Turborepo
- **🎨 UI Moderna** - Diseño responsive con ShadCN/ui y Tailwind CSS

## 🏗️ Arquitectura

### Monorepo Structure
```
LeadsCRM/
├── apps/
│   ├── dashboard/          # Next.js 13+ Frontend (App Router)
│   └── whatsapp-service/   # Express.js Backend + WhatsApp
├── packages/
│   ├── config-eslint/      # ESLint shared config
│   ├── config-ts/          # TypeScript shared config
│   ├── database/           # Prisma schemas + migrations
│   └── ui/                 # Shared UI components (ShadCN/ui)
├── docs/                   # Complete documentation
└── .github/                # CI/CD workflows
```

## 📱 WhatsApp Integration

### Features Completas
- ✅ **Gestión de Sesiones** - Crear, monitorear y eliminar sesiones WhatsApp
- ✅ **QR Code Generation** - Conexión automática con código QR
- ✅ **Envío de Mensajes** - API completa para mensajes de texto/media
- ✅ **Chat Interface** - UI completa para conversaciones en tiempo real
- ✅ **Gestión de Conversaciones** - Listado y navegación de chats
- ✅ **Estados de Mensaje** - Tracking de enviado/entregado/leído
- ✅ **Reconexión Automática** - Recuperación de sesiones perdidas

### Dashboard Integration
```typescript
// Custom API hook for WhatsApp integration
import { useWhatsAppApi } from '@/hooks/use-whatsapp-api'

function ConversationsPage() {
  const {
    getConversations,
    sendMessage,
    isLoading,
    error
  } = useWhatsAppApi()

  // Full integration with optimistic updates
  // Error handling and loading states
  // Real-time conversation management
}
```

## 🚀 Quick Start

### Installation
```bash
# Clone repository
git clone https://github.com/Exceptia-co/LeadsAgent.git
cd LeadsCRM

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

# Build all packages
npm run build
```

### Development
```bash
# Start all services
npm run dev

# Dashboard on :3000
# Docs on :3001
# WhatsApp service on :3002
# API service on :3003
```

## 📖 Documentación

### Archivos de Documentación
- `docs/PROJECT_STATUS.md` - Estado completo del proyecto
- `docs/OPTIMIZATIONS.md` - Optimizaciones técnicas aplicadas
- `docs/coding-guidelines.md` - Standards y patrones de código
- `README.md` - Este archivo

## 🏆 Status

**Estado:** ✅ Production Ready
**Última actualización:** Agosto 2024

El proyecto está completamente funcional y listo para:
- ✅ Desarrollo colaborativo
- ✅ Despliegue en producción  
- ✅ Uso comercial
- ✅ Escalamiento
