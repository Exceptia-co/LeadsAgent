# 🏗️ Architecture - LeadsCRM

_Arquitectura completa del sistema LeadsCRM_

---

## 📋 **Guías de Arquitectura**

### 🎯 **Documentos Principales**

| Documento                                    | Descripción                    | Audiencia       |
| -------------------------------------------- | ------------------------------ | --------------- |
| [`system-overview.md`](./system-overview.md) | **Visión general del sistema** | Todos           |
| [`system-diagrams.md`](./system-diagrams.md) | **Diagramas visuales**         | Desarrolladores |
| [`database-schema.md`](./database-schema.md) | **Esquema de base de datos**   | Backend devs    |
| [`api-endpoints.md`](./api-endpoints.md)     | **Documentación API**          | Frontend devs   |

---

## 🚀 **Quick Reference**

### **Stack Tecnológico**

```
Frontend:    Next.js 14.2.15 + TypeScript + TailwindCSS
Backend:     NestJS + TypeScript + Prisma ORM
Database:    PostgreSQL/Supabase (14 tablas activas)
Auth:        Clerk (JWT + webhooks)
Messaging:   WhatsApp Web.js (multi-sesión)
IA:          OpenRouter + Google Gemini + OpenAI
Cache:       Redis (planned)
Deploy:      Vercel + Supabase (planned)
```

### **Puertos del Sistema**

```
3000 - Dashboard (Next.js)
3001 - Documentation App (Next.js)
3002 - WhatsApp Service (Express)
3003 - API Backend (NestJS)
```

### **Flujo de Datos Principal**

```
WhatsApp → WhatsApp Service → NestJS API → PostgreSQL
    ↓           ↓                ↓           ↓
   QR         Redis           Webhook    14 tablas
Sessions    Pub/Sub         Processing    + datos
```

---

## 📊 **Estado Actual del Sistema**

### ✅ **Componentes Operativos (v2.2.0)**

- 🎯 **14 tablas PostgreSQL** con datos reales operando
- 📊 **6 leads activos** gestionándose con conversaciones
- 🤖 **IA multi-proveedor** intercambiable dinámicamente
- 📱 **WhatsApp multi-sesión** con persistencia
- 📋 **3 templates activos** con variables dinámicas
- 📈 **Analytics tiempo real** funcionando

### 🔄 **En Desarrollo**

- Redis + BullMQ para escalabilidad
- WebSockets para updates instantáneos
- Deploy automatizado (Vercel + Supabase)

---

## 🎯 **Navegación por Rol**

### **👨‍💻 Backend Developer**

1. [`database-schema.md`](./database-schema.md) - Entender las 14 tablas
2. [`api-endpoints.md`](./api-endpoints.md) - Endpoints NestJS
3. [`system-overview.md`](./system-overview.md) - Flujo completo de datos

### **🎨 Frontend Developer**

1. [`api-endpoints.md`](./api-endpoints.md) - Endpoints disponibles
2. [`system-overview.md`](./system-overview.md) - Integración con backend
3. [`system-diagrams.md`](./system-diagrams.md) - Visualización del sistema

### **🏗️ DevOps/Architect**

1. [`system-overview.md`](./system-overview.md) - Arquitectura completa
2. [`system-diagrams.md`](./system-diagrams.md) - Diagramas técnicos
3. [`../deployment/`](../deployment/) - Configuración de deploy

### **🔍 QA/Testing**

1. [`api-endpoints.md`](./api-endpoints.md) - Endpoints para testing
2. [`database-schema.md`](./database-schema.md) - Datos de prueba
3. [`../development/`](../development/) - Testing guidelines

---

## 📚 **Documentación Relacionada**

### **Setup y Configuración**

- [`../getting-started/`](../getting-started/) - Setup inicial
- [`../features/`](../features/) - Funcionalidades del sistema
- [`../reference/`](../reference/) - Referencias rápidas

### **Desarrollo**

- [`../development/coding-guidelines.md`](../development/coding-guidelines.md) - Standards
- [`../development/build-optimizations.md`](../development/build-optimizations.md) - Performance
- [`../PRACTICAL_EXAMPLES.md`](../PRACTICAL_EXAMPLES.md) - Ejemplos

### **Deploy y Ops**

- [`../deployment/`](../deployment/) - Guías de despliegue
- [`../SECURITY.md`](../SECURITY.md) - Medidas de seguridad
- [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) - Debugging

---

_Para una visión completa del sistema, empieza por [`system-overview.md`](./system-overview.md)_
