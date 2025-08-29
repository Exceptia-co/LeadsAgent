# 🔧 Guía para Configurar Clerk y Resolver Problemas de Logout

## 🚨 Problemas Identificados

Tu aplicación tiene los siguientes problemas:

1. **Redirección incorrecta**: Las claves de Clerk están apuntando a `assuring-possum-6.clerk.accounts.dev` (URL incorrecta)
2. **Errores de Sentry**: Ad blocker está bloqueando requests (`net::ERR_BLOCKED_BY_CLIENT`)
3. **Variables no configuradas**: Las claves de Clerk son placeholders o inválidas

## ✅ Soluciones Implementadas

### 1. **Sentry Deshabilitado**
- ✅ Comenté las variables de Sentry en `.env`
- ✅ Esto resolverá los errores `net::ERR_BLOCKED_BY_CLIENT`

### 2. **Variables de Clerk Actualizadas**
- ✅ Reemplacé las claves inválidas con placeholders claros
- ✅ Agregué comentarios explicativos

## 🔑 Pasos para Configurar Clerk Correctamente

### **Paso 1: Crear Nuevo Proyecto en Clerk**

1. Ve a [dashboard.clerk.dev](https://dashboard.clerk.dev)
2. Haz clic en **"Create application"**
3. **Nombre**: `LeadsCRM` (o el que prefieras)
4. **Providers de autenticación**: 
   - ✅ Email
   - ✅ Google (opcional)
   - ✅ Username + Password

### **Paso 2: Configurar URLs del Proyecto**

En la configuración del proyecto, establece:

```bash
# Home URL
http://localhost:3000

# Sign-in URL  
http://localhost:3000/sign-in

# Sign-up URL
http://localhost:3000/sign-up

# After sign-in URL
http://localhost:3000/dashboard

# After sign-up URL  
http://localhost:3000/dashboard
```

### **Paso 3: Obtener las Claves**

En **Settings > API Keys**:

1. **Publishable key** → Copia la que empieza con `pk_test_`
2. **Secret key** → Copia la que empieza con `sk_test_`

### **Paso 4: Actualizar tu .env**

Reemplaza en tu archivo `.env`:

```env
# Authentication (Clerk)
CLERK_WEBHOOK_SECRET="whsec_dev_placeholder_change_in_production"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_TU_CLAVE_AQUI"
CLERK_SECRET_KEY="sk_test_TU_CLAVE_AQUI"
```

### **Paso 5: Configurar Webhooks (Opcional pero Recomendado)**

1. En Clerk Dashboard → **Webhooks**
2. **Add endpoint**: `http://localhost:3000/api/webhooks/clerk`
3. **Events**: `user.created`, `user.updated`, `user.deleted`
4. Copia el **Signing Secret** y úsalo en `CLERK_WEBHOOK_SECRET`

## 🧪 Verificar Configuración

### **1. Reiniciar el Servidor**

```bash
# Parar todos los servicios
Ctrl + C

# Reiniciar
pnpm dev:dashboard
```

### **2. Probar en el Navegador**

1. Ve a `http://localhost:3000/test-clerk`
2. Deberías ver información de diagnóstico
3. **IsLoaded** debe ser `✅ True`
4. **Environment Variables** debe mostrar tu clave

### **3. Probar Login/Logout**

1. Ve a `http://localhost:3000/sign-up`
2. Crea una cuenta nueva
3. Verifica que te redirija a `/dashboard`
4. **Logout** debería redirirte a la página principal

## 🔍 Debug si Persisten Problemas

### **Verificar Variables de Entorno**

```bash
# En PowerShell (Windows)
echo $env:NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

# O revisar en la página de test
http://localhost:3000/test-clerk
```

### **Limpiar Cache del Navegador**

1. Abre **DevTools** (F12)
2. **Application** > **Storage**
3. **Clear site data**
4. **Reload** la página

### **Logs Útiles**

Revisa la consola del navegador para:
- ✅ Sin errores `net::ERR_BLOCKED_BY_CLIENT` (Sentry resuelto)
- ✅ Sin redirecciones a `assuring-possum-6.accounts.dev`
- ✅ Mensajes de Clerk indicando desarrollo: `Clerk has been loaded with development keys`

## 📝 Resultados Esperados

Después de seguir estos pasos:

1. **Login** → Funciona sin errores
2. **Logout** → Redirección correcta a `/`
3. **Dashboard** → Protegido y accesible solo autenticado
4. **Sin errores en consola** → Sentry deshabilitado

## 🆘 Si Sigues Teniendo Problemas

1. **Verifica las URLs** en Clerk Dashboard coincidan exactamente
2. **Asegúrate** de que las claves sean de **desarrollo** (`pk_test_`, `sk_test_`)  
3. **Reinicia completamente** el servidor después de cambiar `.env`
4. **Revisa** que no haya ad blockers interfiriendo

---

## ⚡ Quick Fix Commands

```bash
# 1. Reiniciar servidor
pnpm dev:dashboard

# 2. Limpiar cache (si es necesario)
rm -rf .next
pnpm dev:dashboard

# 3. Verificar
# Ir a http://localhost:3000/test-clerk
```

Una vez que tengas las claves correctas de Clerk, el problema del logout se resolverá completamente.
