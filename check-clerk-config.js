#!/usr/bin/env node

/**
 * Script para verificar la configuración de Clerk
 * Ejecutar con: node check-clerk-config.js
 */

console.log('🔍 Verificando configuración de Clerk...\n');

// Verificar variables de entorno
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const secretKey = process.env.CLERK_SECRET_KEY;
const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

console.log('📋 Variables de entorno:');
console.log(`✅ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${publishableKey ? 'Configurada' : '❌ Faltante'}`);
if (publishableKey) {
  console.log(`   Preview: ${publishableKey.substring(0, 20)}...`);
  
  // Decodificar la clave para ver el dominio
  try {
    const decoded = Buffer.from(publishableKey.replace('pk_test_', ''), 'base64').toString();
    console.log(`   🌐 Dominio: ${decoded}`);
  } catch (e) {
    console.log(`   ⚠️  No se pudo decodificar el dominio`);
  }
}

console.log(`✅ CLERK_SECRET_KEY: ${secretKey ? 'Configurada' : '❌ Faltante'}`);
if (secretKey) {
  console.log(`   Preview: ${secretKey.substring(0, 20)}...`);
}

console.log(`⚠️  CLERK_WEBHOOK_SECRET: ${webhookSecret ? 'Configurada' : '❌ Faltante (opcional en desarrollo)'}`);

console.log('\n🎯 URLs que debes configurar en Clerk Dashboard:');
console.log('');
console.log('📍 Settings → Domains → Development Domain:');
console.log('   Frontend API: http://localhost:3000');
console.log('');
console.log('📍 Settings → Paths:');
console.log('   Sign-in URL: /sign-in');
console.log('   Sign-up URL: /sign-up');
console.log('   After sign-in URL: /dashboard');
console.log('   After sign-up URL: /dashboard');
console.log('');

console.log('🔗 URLs importantes:');
console.log('   Dashboard: https://dashboard.clerk.dev');
console.log('   Tu proyecto: https://dashboard.clerk.dev/apps/{tu-app-id}');
console.log('');

console.log('🧪 Para probar:');
console.log('   1. Reinicia el servidor: pnpm dev:dashboard');
console.log('   2. Ve a: http://localhost:3000/test-clerk');
console.log('   3. Verifica que IsLoaded = true');
console.log('   4. Prueba login/logout');
