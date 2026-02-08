# 🚀 Getting Started - LeadsCRM

_Guía completa para configurar LeadsCRM desde cero_

---

## 📋 **Setup Rápido (15 minutos)**

### ✅ **Checklist de Configuración**

- [ ] 1. **[Configurar Base de Datos](./database-setup.md)** (5 min)
  - PostgreSQL/Supabase
  - Variables de entorno
  - Migraciones iniciales

- [ ] 2. **[Configurar Autenticación](./authentication-setup.md)** (5 min)
  - Cuenta Clerk
  - API keys
  - Webhooks

---

## 🎯 **Path de Setup por Rol**

### **👤 Nuevo Usuario**

```bash
1. database-setup.md    # Configurar PostgreSQL
2. authentication-setup.md  # Setup Clerk
3. npm install && npm run dev  # ¡Listo!
```

### **Desarrollador**

```bash
1. database-setup.md    # Full DB setup
2. authentication-setup.md  # Clerk + webhooks
3. ../development/     # Coding guidelines
```

### **🚀 DevOps/Deploy**

```bash
1. database-setup.md    # Production DB
2. authentication-setup.md  # Production Clerk
3. ../deployment/      # Deploy guides
4. ../reference/       # Environment vars
```

---

## 📊 **Verificación Post-Setup**

### ✅ **Comandos de Verificación**

```bash
# 1. Verificar base de datos
pnpm db:studio

# 2. Verificar servicios
pnpm dev

# 3. Verificar puertos
curl http://localhost:3001  # Dashboard
curl http://localhost:3003/health  # API
curl http://localhost:3002/health  # WhatsApp Service
```

### ✅ **Indicadores de Éxito**

- ✅ Dashboard carga en http://localhost:3001
- ✅ Login con Clerk funciona
- ✅ Base de datos conecta sin errores
- ✅ API responde health checks
- ✅ WhatsApp service arranca correctamente

---

## 🆘 **Problemas Comunes**

### **🔴 Base de Datos no Conecta**

```bash
# Verificar variables de entorno
cat .env | grep DATABASE_URL

# Regenerar cliente Prisma
pnpm db:generate

# Aplicar migraciones
pnpm db:migrate:dev
```

### **🔴 Clerk Auth Falla**

```bash
# Verificar keys en .env
cat .env | grep CLERK

# Verificar configuración Clerk dashboard
# → Web: http://localhost:3001
# → API: http://localhost:3003
```

### **🔴 Servicios no Arrancan**

```bash
# Limpiar cache y reinstalar
pnpm clean:cache
pnpm install

# Build limpio
pnpm build:fast
```

---

## 📚 **Documentación Relacionada**

### **Configuración Básica**

- [`../README.md`](../README.md) - Índice maestro
- [`../reference/environment-vars.md`](../reference/environment-vars.md) - Variables completas


### **Desarrollo**

- [`../development/coding-guidelines.md`](../development/coding-guidelines.md) - Standards
- [`../development/build-optimizations.md`](../development/build-optimizations.md) - Performance
- [`../architecture/system-overview.md`](../architecture/system-overview.md) - Arquitectura

### **Troubleshooting**

- [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) - FAQ y soluciones
- [`../DEBUG_SOLUTIONS.md`](../DEBUG_SOLUTIONS.md) - Debug específico


---

## 🎉 **¡Setup Completado!**

Una vez completados los 3 pasos principales:

1. **Explora el Sistema**:
   - [`../features/`](../features/) - Conoce todas las funcionalidades
   - [`../architecture/`](../architecture/) - Entiende la arquitectura

2. **Aprende a Desarrollar**:
   - [`../development/`](../development/) - Guías de desarrollo
   - [`../PRACTICAL_EXAMPLES.md`](../PRACTICAL_EXAMPLES.md) - Ejemplos prácticos

3. **Deploy a Producción**:
   - [`../deployment/`](../deployment/) - Guías de despliegue
   - [`../SECURITY.md`](../SECURITY.md) - Medidas de seguridad

---

_¿Necesitas ayuda? Consulta [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) o abre un issue en GitHub._
