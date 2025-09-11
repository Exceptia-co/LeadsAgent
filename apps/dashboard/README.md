# Dashboard LeadsCRM - Frontend Application

Dashboard web moderno construido con Next.js 14.2.15, React 18 y TypeScript para gestión completa de leads y WhatsApp.

## 📋 Descripción

Aplicación frontend del sistema LeadsCRM que proporciona interfaz gráfica para:
- Gestión completa de leads (CRUD, filtros, bulk actions)
- Dashboard principal con analytics en tiempo real
- Gestión de sesiones WhatsApp multi-número
- Chat y conversaciones con soporte para multimedia
- Analytics avanzados y estadísticas
- Sistema de autorización WhatsApp por lead

## 🛠️ Stack Tecnológico

- **Framework**: Next.js 14.2.15 con App Router
- **UI Library**: React 18
- **Styling**: TailwindCSS + shadcn/ui components
- **Authentication**: Clerk (SSO, JWT tokens)
- **State Management**: React Context + SWR para fetching
- **Type Safety**: TypeScript strict mode
- **Icons**: Lucide React
- **Forms**: React Hook Form + class-validator

## 📂 Estructura del Proyecto

```
apps/dashboard/
├── app/                    # App Router (Next.js 13+)
│   ├── dashboard/         # Protected dashboard routes
│   │   ├── leads/        # Lead management pages
│   │   ├── whatsapp/     # WhatsApp management
│   │   └── page.tsx      # Dashboard home
│   ├── globals.css       # Global styles + TailwindCSS
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Landing page
├── components/           # React components
│   ├── ui/              # shadcn/ui components (Badge, Card, etc.)
│   ├── AddLeadModal.tsx # Lead creation modal
│   ├── LeadSelector.tsx # Lead selection component
│   └── WhatsAppConversations.tsx
├── hooks/               # Custom React hooks
│   ├── use-leads.ts     # Lead data fetching
│   └── use-whatsapp-api.ts # WhatsApp API integration
├── lib/                 # Utilities
│   └── api.ts          # API client configuration
├── types/              # TypeScript type definitions
│   └── index.ts        # Shared types for leads, messages, etc.
└── middleware.ts       # Clerk auth middleware
```

## 🚀 Rutas Implementadas

### Públicas
- `/` - Landing page
- `/sign-in` - Página de inicio de sesión (Clerk)
- `/sign-up` - Página de registro (Clerk)

### Protegidas (requieren autenticación)
- `/dashboard` - Dashboard principal con métricas
- `/dashboard/leads` - Gestión completa de leads
- `/dashboard/whatsapp` - Gestión completa de WhatsApp (sesiones, conversaciones, templates)
- `/dashboard/whatsapp-stats` - Estadísticas de WhatsApp IA

## 🧩 Componentes Principales

### Dashboard Principal
- **MetricCards**: Tarjetas de métricas en tiempo real
- **LeadsByStatus**: Distribución de leads por estado
- **RecentLeads**: Lista de leads más recientes
- **QuickActions**: Acciones rápidas de navegación

### Gestión de Leads
- **LeadsList**: Tabla completa con filtros y paginación
- **LeadFilters**: Sistema de filtros avanzados
- **AddLeadModal**: Modal para crear nuevos leads
- **LeadActions**: Acciones bulk (editar, eliminar, etc.)
- **WhatsAppAuthToggle**: Toggle de autorización WhatsApp

### WhatsApp Dashboard
- **SessionManager**: Gestión de sesiones múltiples
- **MessageSender**: Componente para envío de mensajes
- **ConversationsList**: Lista de conversaciones activas
- **QRCodeDisplay**: Visualización de códigos QR
- **MessageHistory**: Historial con analytics

### UI Components (shadcn/ui)
- **Card**: Contenedores con shadow
- **Badge**: Estados y etiquetas
- **Button**: Botones con variantes
- **Dialog/Modal**: Modales y diálogos
- **Table**: Tablas responsivas
- **Form**: Componentes de formularios

## 🔗 Integración con APIs

### Backend API (Puerto 3003)
```typescript
// Endpoints consumidos
GET /api/leads              // Lista de leads
POST /api/leads             // Crear lead
PATCH /api/leads/:id/status // Actualizar estado
GET /api/leads/stats        // Estadísticas
PATCH /api/public/leads/:id/whatsapp // Toggle WhatsApp auth
```

### WhatsApp Service (Puerto 3002)
```typescript
// Endpoints WhatsApp
GET /api/v1/sessions        // Sesiones WhatsApp
POST /api/v1/sessions       // Crear sesión
POST /api/v1/sessions/:id/send // Enviar mensaje
GET /api/v1/analytics/messages // Analytics
GET /api/v1/conversations   // Lista conversaciones
```

## 🔐 Autenticación y Autorización

### Clerk Integration
- **SSO completo**: Google, GitHub, email/password
- **Middleware protection**: Rutas protegidas automáticamente
- **JWT tokens**: Validación en backend NestJS
- **User session**: Estado de usuario persistente
- **Role-based access**: Roles de usuario (pendiente implementar)

### Protected Routes
```typescript
// middleware.ts
export const config = {
  matcher: ['/dashboard/:path*']
}
```

## 🎨 Styling y UI

### TailwindCSS Configuration
- **Design System**: Colores, espaciado, tipografía consistente
- **Dark Mode**: Soporte para modo oscuro (configurado)
- **Responsive Design**: Mobile-first approach
- **CSS Variables**: Para theming dinámico

### Component Variants
```typescript
// Status badges
export const STATUS_VARIANTS = {
  NUEVO: 'default',
  CONTACTADO: 'secondary',
  QUALIFIED: 'warning',
  GANADO: 'success',
  PERDIDO: 'destructive'
}
```

## 📊 State Management

### SWR Data Fetching
```typescript
// Custom hooks para data fetching
export function useLeads(page = 1, limit = 20) {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/leads?page=${page}&limit=${limit}`,
    fetcher
  )
  return { leads: data?.leads || [], pagination: data?.pagination, error, isLoading, refetch: mutate }
}
```

### Local State Management
- **React Context**: Para estado global compartido
- **useState**: Para estado local de componentes
- **useReducer**: Para estado complejo (formularios)

## 🔧 Development Setup

### Desarrollo Local
```bash
# Desde la raíz del monorepo
pnpm dev:dashboard

# O desde este directorio
cd apps/dashboard
pnpm dev
```

### Variables de Entorno
```bash
# .env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=http://localhost:3003
NEXT_PUBLIC_WHATSAPP_API_URL=http://localhost:3002
```

### Scripts Disponibles
```json
{
  "dev": "next dev -p 3000",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "type-check": "tsc --noEmit"
}
```

## 🧪 Testing Strategy

### Testing Tools
- **Jest**: Unit testing framework
- **React Testing Library**: Component testing
- **MSW**: API mocking para tests

### Test Categories
- **Components**: Renderizado y interacciones
- **Hooks**: Lógica de data fetching
- **API Integration**: Mocking de endpoints
- **Authentication**: Flujos de Clerk

## 🚀 Build y Deploy

### Production Build
```bash
pnpm build        # Next.js production build
pnpm build:fast   # Con Turborepo caching
```

### Deployment
- **Vercel**: Deployment automático desde main branch
- **Environment Variables**: Configuradas en Vercel dashboard
- **Domain**: Configurado con SSL automático

## 🔍 Performance Optimizations

### Next.js Features
- **App Router**: Latest Next.js architecture
- **Server Components**: Para mejor performance
- **Image Optimization**: next/image para imágenes
- **Font Optimization**: next/font con Inter

### Code Splitting
- **Dynamic Imports**: Para componentes grandes
- **Route-based splitting**: Automático con App Router
- **Bundle Analysis**: Para optimizar tamaño

## 🐛 Debugging

### Development Tools
- **React DevTools**: Para debugging de componentes
- **Network Tab**: Para debugging de API calls
- **Console Logging**: Para debugging de hooks

### Common Issues
- **Auth Issues**: Verificar Clerk configuration
- **API Errors**: Verificar backend en puerto 3003
- **Build Errors**: Verificar TypeScript errors

## 📱 Mobile Responsiveness

Todas las páginas están optimizadas para móviles:
- **Breakpoints**: sm, md, lg, xl, 2xl
- **Navigation**: Menú hamburguesa en móviles
- **Tables**: Scroll horizontal en pantallas pequeñas
- **Modals**: Stack verticalmente en móviles

## 🔄 Real-time Features

### Current Implementation
- **SWR Revalidation**: Auto-refresh de datos
- **Optimistic Updates**: UI updates antes de confirmación
- **Error Boundaries**: Manejo de errores graceful

### Future Enhancements
- **WebSocket Integration**: Para updates en tiempo real
- **Push Notifications**: Para nuevos mensajes
- **Offline Support**: Service Workers para offline

Visita [http://localhost:3000](http://localhost:3000) después de ejecutar `pnpm dev`.
