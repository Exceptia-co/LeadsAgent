#!/usr/bin/env node

/**
 * Script para verificar la conexión con Supabase y mostrar las credenciales necesarias
 * Ejecutar con: node scripts/check-supabase-connection.js
 */

// Cargar variables de entorno desde .env.local
require('dotenv').config({ path: '.env.local' })

console.log('🔍 Verificando configuración de Supabase...\n')

// Verificar variables de entorno
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
]

const missingVars = []
const presentVars = []

requiredEnvVars.forEach(varName => {
  const value = process.env[varName]
  if (!value) {
    missingVars.push(varName)
  } else {
    presentVars.push({
      name: varName,
      value: value.substring(0, 20) + '...',
      length: value.length
    })
  }
})

console.log('📊 Estado de las variables de entorno:')
console.log('=====================================')

if (presentVars.length > 0) {
  console.log('✅ Variables configuradas:')
  presentVars.forEach(v => {
    console.log(`  ${v.name}: ${v.value} (${v.length} caracteres)`)
  })
  console.log()
}

if (missingVars.length > 0) {
  console.log('❌ Variables faltantes:')
  missingVars.forEach(v => {
    console.log(`  ${v}`)
  })
  console.log()
  console.log('📝 Para obtener estas variables:')
  console.log('1. Ve a https://supabase.com')
  console.log('2. Selecciona tu proyecto')
  console.log('3. Ve a Settings → API')
  console.log('4. Copia:')
  console.log('   - URL: Tu Project URL')
  console.log('   - NEXT_PUBLIC_SUPABASE_ANON_KEY: La "anon public" key')
  console.log('   - SUPABASE_SERVICE_ROLE_KEY: La "service_role" key ⚠️')
  console.log()
  
  console.log('💡 Crea un archivo .env.local en apps/dashboard/ con:')
  console.log('```')
  console.log('NEXT_PUBLIC_SUPABASE_URL="https://tu-proyecto.supabase.co"')
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY="tu_anon_key"') 
  console.log('SUPABASE_SERVICE_ROLE_KEY="tu_service_role_key"')
  console.log('```')
  console.log()
  process.exit(1)
}

// Si tenemos las variables, intentar conexión
async function testConnection() {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    console.log('🔄 Probando conexión con Supabase...')
    
    // Test 1: Verificar conexión básica
    const { data, error } = await supabase
      .from('users')
      .select('count(*)', { count: 'exact', head: true })
    
    if (error) {
      console.log('❌ Error de conexión:', error.message)
      console.log('💡 Posibles causas:')
      console.log('  - Service role key incorrecto')
      console.log('  - URL del proyecto incorrecto') 
      console.log('  - Tabla "users" no existe')
      process.exit(1)
    }

    console.log(`✅ Conexión exitosa! Usuarios en base de datos: ${data?.length || 0}`)
    
    // Test 2: Verificar tabla users
    const { data: users } = await supabase
      .from('users')
      .select('clerk_id, email, role')
      .limit(3)
    
    if (users && users.length > 0) {
      console.log('\n👥 Usuarios encontrados:')
      users.forEach(user => {
        console.log(`  - ${user.email} (${user.role}) [${user.clerk_id}]`)
      })
    } else {
      console.log('\n📝 La tabla users está vacía')
      console.log('💡 Esto es normal si es la primera vez configurando')
    }
    
    console.log('\n🎉 Configuración de Supabase correcta!')
    
  } catch (importError) {
    console.log('❌ Error: @supabase/supabase-js no está instalado')
    console.log('💡 Ejecuta: pnpm add @supabase/supabase-js --filter=@leadcrm/dashboard')
  }
}

if (missingVars.length === 0) {
  testConnection()
}
