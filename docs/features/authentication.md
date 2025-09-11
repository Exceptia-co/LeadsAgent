# Arquitectura de Autenticación LeadsCRM

## 🔐 Resumen

LeadsCRM utiliza una arquitectura de autenticación híbrida que combina **Clerk** (autenticación frontend) con **Supabase RLS** (seguridad de base de datos) a través de una API backend (NestJS).

## 🏗️ Arquitectura

### Flujo de Autenticación
```
┌─────────────┐    JWT Token    ┌──────────────┐   Service Role   ┌─────────────┐
│   Clerk     │ ──────────────> │   NestJS     │ ──────────────> │  Supabase   │
│ (Frontend)  │                 │    API       │                 │ (Database)  │
└─────────────┘                 └──────────────┘                 └─────────────┘
```

### Componentes

#### 1. **Clerk (Frontend Authentication)**
- **Función**: Autenticación de usuarios, registro, login, sesiones
- **Ubicación**: Dashboard Next.js (`apps/dashboard`)
- **Configuración**:
  ```env
  CLERK_SECRET_KEY="sk_test_..."
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
  ```
- **Responsabilidades**:
  - Manejo de formularios de login/registro
  - Generación de JWT tokens
  - Gestión de sesiones de usuario
  - Protección de rutas frontend

#### 2. **NestJS API (Backend Authentication)**
- **Función**: Verificación de tokens, lógica de negocio, conexión a DB
- **Ubicación**: API Backend (`apps/api`)
- **Configuración**:
  ```env
  CLERK_SECRET_KEY="sk_test_..." # Para verificar tokens
  DATABASE_URL="postgresql://..." # Service role connection
  ```
- **Responsabilidades**:
  - Verificar JWT tokens de Clerk
  - Aplicar lógica de autorización (ADMIN vs AGENT)
  - Filtrar datos según permisos del usuario
  - Conectar a Supabase con service role

#### 3. **Supabase (Database Security)**
- **Función**: Protección de datos con RLS, backup de seguridad
- **Configuración**: Row Level Security habilitado
- **Responsabilidades**:
  - RLS policies para proteger acceso directo a DB
  - Service role bypass para operaciones del API
  - Backup de seguridad si el API falla

## 🔄 Flujo de Request Típico

### 1. Usuario hace login
```typescript
// Frontend (Dashboard)
const { signIn } = useAuth()
await signIn.create({ identifier: "user@example.com", password: "..." })
```

### 2. Clerk genera JWT token
```javascript
// Token contiene información del usuario
{
  "sub": "user_clerk_id_123", // ID único de Clerk
  "email": "user@example.com",
  "role": "agent", // Custom claim (si se configura)
  "iat": 1234567890
}
```

### 3. Frontend hace request al API
```typescript
// Frontend API call
const { getToken } = useAuth()
const token = await getToken()

fetch('/api/leads', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

### 4. API verifica token y consulta DB
```typescript
// Backend (NestJS)
@UseGuards(ClerkAuthGuard)
async getLeads(@Request() req) {
  const clerkUserId = req.user.sub // Extraído del JWT
  
  // Consultar con service role, filtrar por lógica de negocio
  const leads = await this.prisma.lead.findMany({
    where: {
      OR: [
        { assignedTo: clerkUserId }, // Leads del usuario
        { assignedTo: null },        // Leads sin asignar
        // Admins ven todo (se verifica en el guard)
      ]
    }
  })
  
  return leads
}
```

## ⚙️ Configuración por Ambiente

### **Desarrollo Local**
```env
# Frontend (.env.local)
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."

# Backend (.env.local) 
CLERK_SECRET_KEY="sk_test_..." # Mismo que frontend
DATABASE_URL="postgresql://service_role@supabase..."
```

### **Producción**
```env
# Frontend
CLERK_SECRET_KEY="sk_live_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..."

# Backend
CLERK_SECRET_KEY="sk_live_..." # Mismo que frontend
DATABASE_URL="postgresql://service_role@supabase..."
```

## 🛡️ Seguridad

### **Niveles de Protección**

1. **Nivel Frontend (Clerk)**:
   - Protección de rutas con middleware
   - Validación de sesiones activas
   - Redirección automática a login

2. **Nivel API (NestJS + Clerk)**:
   - Verificación de JWT tokens
   - Guards de autorización por roles
   - Validación de permisos por endpoint

3. **Nivel Database (Supabase RLS)**:
   - Policies que limitan acceso directo
   - Service role bypass para API
   - Protección contra acceso no autorizado

### **Roles y Permisos**

#### **AGENT** (Agente)
```typescript
// Puede ver/editar solo leads asignados + sin asignar
const agentLeads = await prisma.lead.findMany({
  where: {
    OR: [
      { assignedTo: clerkUserId },
      { assignedTo: null }
    ]
  }
})
```

#### **ADMIN** (Administrador)
```typescript
// Puede ver/editar todos los leads
const adminLeads = await prisma.lead.findMany() // Sin filtros
```

## 🚀 Ventajas de esta Arquitectura

### ✅ **Beneficios**
- **Separación de responsabilidades**: Cada componente tiene una función específica
- **Escalabilidad**: Frontend y backend pueden escalar independientemente
- **Seguridad en capas**: Múltiples niveles de protección
- **Flexibilidad**: Fácil cambiar providers (Clerk, Supabase) sin afectar toda la app
- **Performance**: Service role permite consultas optimizadas

### ✅ **No Necesitas**
- ❌ Configurar Supabase Auth (Row Level Security ya está configurado)
- ❌ Conectar Clerk directamente a Supabase
- ❌ Usar Supabase client libraries en el frontend (para autenticación)
- ❌ Configurar JWT en Supabase (el API maneja toda la autenticación)

## 🔧 Troubleshooting

### **Problema**: "UserContext not found"
**Solución**: Verificar que `ClerkProvider` esté en root layout y claves estén correctas

### **Problema**: "Token verification failed"  
**Solución**: Verificar que `CLERK_SECRET_KEY` sea la misma en frontend y backend

### **Problema**: "Database connection refused"
**Solución**: Verificar `DATABASE_URL` con service role credentials

### **Problema**: "RLS policy violation"
**Solución**: Confirmar que service role policies están configuradas correctamente

## 📚 Referencias

- [Clerk Next.js Documentation](https://clerk.com/docs/references/nextjs)
- [NestJS Authentication](https://docs.nestjs.com/security/authentication)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

---

*Documento actualizado: Agosto 21, 2025*  
*Estado: ✅ Configuración completa y funcional*
