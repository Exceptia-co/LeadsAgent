# Configuración de Supabase - Instrucciones

## 🔑 Obtener Contraseña de Base de Datos

Para completar la migración a PostgreSQL, necesitas la contraseña de tu base de datos de Supabase:

### Pasos para obtener la contraseña:

1. **Ir al dashboard de Supabase:**
   - Abre [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Inicia sesión en tu cuenta

2. **Seleccionar tu proyecto:**
   - Busca y selecciona el proyecto con referencia: `PROJECT_REF_REMOVED`

3. **Acceder a Settings > Database:**
   - Ve a la sección "Settings" (⚙️) en el sidebar izquierdo
   - Luego haz clic en "Database"

4. **Obtener Connection String:**
   - En la sección "Connection string"
   - Selecciona "URI" 
   - Verás algo como: `postgresql://postgres.PROJECT_REF_REMOVED:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
   - Copia la parte que dice `[YOUR-PASSWORD]`

### Una vez que tengas la contraseña:

1. **Actualizar archivo .env:**
   - Edita el archivo `.env` en la raíz del proyecto
   - Reemplaza `[YOUR_PASSWORD]` en ambas URLs (DATABASE_URL y DIRECT_URL) con tu contraseña real
   - Guarda el archivo

2. **Ejemplo:**
   ```env
   # Si tu contraseña es: mi_password_segura_123
   DATABASE_URL="postgresql://postgres.PROJECT_REF_REMOVED:mi_password_segura_123@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
   DIRECT_URL="postgresql://postgres.PROJECT_REF_REMOVED:mi_password_segura_123@aws-0-us-east-1.compute-1.amazonaws.com:5432/postgres"
   ```

### ⚠️ Importante:
- **NUNCA** compartas esta contraseña en público
- **NO** la incluyas en commits de git (el archivo .env ya está en .gitignore)
- Si no recuerdas la contraseña, puedes resetearla desde el dashboard de Supabase

### ✅ Verificar configuración:
Una vez configurada la contraseña, ejecuta:
```bash
pnpm db:generate
```

Si no hay errores de conexión, la configuración está correcta.

---

## 🚀 Próximos Pasos

Después de configurar la contraseña, podemos:
1. Generar el cliente Prisma para PostgreSQL
2. Crear/aplicar migraciones
3. Migrar los datos existentes de SQLite
4. Configurar Row Level Security (RLS)
