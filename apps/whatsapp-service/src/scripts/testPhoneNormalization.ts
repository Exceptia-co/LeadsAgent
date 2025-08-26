#!/usr/bin/env ts-node

/**
 * Script de prueba para validar la normalización de números telefónicos
 * 
 * Este script prueba diferentes formatos de números telefónicos para asegurar
 * que el servicio de normalización funciona correctamente y evita duplicados.
 */

import { logger } from '../utils/logger';
import PhoneNumberService from '../services/PhoneNumberService';
import DatabaseService from '../services/DatabaseService';

interface TestCase {
  description: string;
  phone1: string;
  phone2: string;
  shouldBeEqual: boolean;
}

// Casos de prueba para validar la normalización
const testCases: TestCase[] = [
  {
    description: "Mismo número con y sin código de país",
    phone1: "+5491123456789",
    phone2: "1123456789",
    shouldBeEqual: true
  },
  {
    description: "Mismo número con diferentes formatos de código de país", 
    phone1: "+549 11 2345 6789",
    phone2: "5491123456789",
    shouldBeEqual: true
  },
  {
    description: "Mismo número con espacios y guiones",
    phone1: "+54-9-11-2345-6789",
    phone2: "+549 11 2345 6789",
    shouldBeEqual: true
  },
  {
    description: "Números completamente diferentes",
    phone1: "+5491123456789",
    phone2: "+5491987654321",
    shouldBeEqual: false
  },
  {
    description: "Número local argentino vs internacional",
    phone1: "011-2345-6789",
    phone2: "+54911234567890",
    shouldBeEqual: false // Nota: diferentes porque uno tiene un dígito extra
  },
  {
    description: "Números con prefijo 0 local",
    phone1: "011-2345-6789", 
    phone2: "11-2345-6789",
    shouldBeEqual: true
  },
  {
    description: "Mismo número con diferentes códigos de país",
    phone1: "+1234567890",
    phone2: "+52234567890", 
    shouldBeEqual: false
  },
  {
    description: "Números argentinos con y sin prefijo 9 de móvil",
    phone1: "+5491123456789",
    phone2: "+54112345678",
    shouldBeEqual: false // Son diferentes porque uno es móvil (+54 9 11) y otro fijo (+54 11)
  }
];

/**
 * Ejecuta todas las pruebas de normalización
 */
async function runPhoneNormalizationTests(): Promise<void> {
  logger.info('🧪 Iniciando pruebas de normalización de números telefónicos...\n');

  let passedTests = 0;
  let totalTests = testCases.length;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    
    console.log(`\n📋 Test ${i + 1}/${totalTests}: ${testCase.description}`);
    console.log(`   📞 Número 1: "${testCase.phone1}"`);
    console.log(`   📞 Número 2: "${testCase.phone2}"`);
    console.log(`   🎯 Esperado: ${testCase.shouldBeEqual ? 'IGUALES' : 'DIFERENTES'}`);
    
    // Normalizar ambos números
    const normalized1 = PhoneNumberService.normalizePhoneNumber(testCase.phone1);
    const normalized2 = PhoneNumberService.normalizePhoneNumber(testCase.phone2);
    
    console.log(`   🔧 Normalizado 1: "${normalized1}"`);
    console.log(`   🔧 Normalizado 2: "${normalized2}"`);
    
    // Comparar números
    const areEqual = PhoneNumberService.arePhoneNumbersEquivalent(testCase.phone1, testCase.phone2);
    
    console.log(`   📊 Resultado: ${areEqual ? 'IGUALES' : 'DIFERENTES'}`);
    
    // Verificar si el resultado es correcto
    const testPassed = areEqual === testCase.shouldBeEqual;
    
    if (testPassed) {
      console.log(`   ✅ PASSED`);
      passedTests++;
    } else {
      console.log(`   ❌ FAILED - Esperado: ${testCase.shouldBeEqual ? 'IGUALES' : 'DIFERENTES'}, Obtenido: ${areEqual ? 'IGUALES' : 'DIFERENTES'}`);
    }
  }

  console.log(`\n📈 RESUMEN DE PRUEBAS:`);
  console.log(`   ✅ Pasadas: ${passedTests}/${totalTests}`);
  console.log(`   ❌ Fallidas: ${totalTests - passedTests}/${totalTests}`);
  console.log(`   📊 Tasa de éxito: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    logger.info('🎉 ¡Todas las pruebas de normalización pasaron exitosamente!');
  } else {
    logger.warn(`⚠️ ${totalTests - passedTests} pruebas fallaron. Revisar la lógica de normalización.`);
  }
}

/**
 * Prueba la prevención de duplicados en la base de datos
 */
async function testDuplicatePrevention(): Promise<void> {
  logger.info('\n🛡️ Probando prevención de duplicados en base de datos...\n');

  try {
    // Números de prueba que son equivalentes pero en diferentes formatos
    const testNumbers = [
      "+5491123456789",
      "5491123456789", 
      "+549 11 2345 6789",
      "011-2345-6789",
      "+54-9-11-2345-6789"
    ];

    console.log('📞 Probando con números equivalentes:');
    testNumbers.forEach((num, i) => {
      console.log(`   ${i + 1}. "${num}"`);
    });

    // Intentar crear un lead con el primer formato
    console.log(`\n1️⃣ Creando lead con número: "${testNumbers[0]}"`);
    
    try {
      const firstLead = await DatabaseService.createLead({
        name: "Usuario de Prueba",
        phone: testNumbers[0],
        email: "test@example.com",
        source: "test_script"
      });

      if (firstLead) {
        console.log(`   ✅ Lead creado exitosamente con ID: ${firstLead.id}`);
        console.log(`   📞 Número almacenado: "${firstLead.phone}"`);
      } else {
        console.log(`   ❌ No se pudo crear el lead`);
        return;
      }
    } catch (error: any) {
      console.log(`   ❌ Error creando primer lead: ${error.message}`);
      return;
    }

    // Intentar crear leads con los otros formatos (deberían ser rechazados)
    for (let i = 1; i < testNumbers.length; i++) {
      console.log(`\n${i + 1}️⃣ Intentando crear lead duplicado con número: "${testNumbers[i]}"`);
      
      try {
        const duplicateLead = await DatabaseService.createLead({
          name: `Usuario Duplicado ${i}`,
          phone: testNumbers[i],
          email: `test${i}@example.com`,
          source: "test_script"
        });

        if (duplicateLead) {
          console.log(`   ❌ ERROR: Se creó un lead duplicado (ID: ${duplicateLead.id}) - La normalización falló`);
        }
      } catch (error: any) {
        if (error.message.includes('Duplicate phone number')) {
          console.log(`   ✅ CORRECTO: Duplicado detectado y rechazado - "${error.message}"`);
        } else {
          console.log(`   ⚠️ Error inesperado: ${error.message}`);
        }
      }
    }

    // Verificar que solo existe un lead en la base de datos con esos números
    const allLeads = await DatabaseService.getAllLeads();
    const testLeads = allLeads.filter(lead => {
      return testNumbers.some(testNum => 
        PhoneNumberService.arePhoneNumbersEquivalent(testNum, lead.phone || '')
      );
    });

    console.log(`\n📊 Verificación final:`);
    console.log(`   📋 Leads encontrados con números equivalentes: ${testLeads.length}`);
    
    if (testLeads.length === 1) {
      console.log(`   ✅ CORRECTO: Solo existe 1 lead, sin duplicados`);
      console.log(`   📞 Lead único: ${testLeads[0].name} (${testLeads[0].phone})`);
    } else if (testLeads.length > 1) {
      console.log(`   ❌ ERROR: Se encontraron ${testLeads.length} leads con números equivalentes:`);
      testLeads.forEach((lead, idx) => {
        console.log(`      ${idx + 1}. ${lead.name} - ${lead.phone} (ID: ${lead.id})`);
      });
    } else {
      console.log(`   ⚠️ No se encontraron leads de prueba en la base de datos`);
    }

  } catch (error) {
    logger.error('Error en la prueba de prevención de duplicados:', error);
  }
}

/**
 * Función principal para ejecutar todas las pruebas
 */
async function main(): Promise<void> {
  console.log('🚀 INICIANDO PRUEBAS DE NORMALIZACIÓN DE NÚMEROS TELEFÓNICOS');
  console.log('===========================================================\n');

  try {
    // Ejecutar pruebas de normalización
    await runPhoneNormalizationTests();
    
    // Ejecutar pruebas de prevención de duplicados
    await testDuplicatePrevention();

    console.log('\n===========================================================');
    console.log('🏁 PRUEBAS COMPLETADAS');
    
  } catch (error) {
    logger.error('Error ejecutando las pruebas:', error);
    process.exit(1);
  }
}

// Ejecutar el script si se llama directamente
if (require.main === module) {
  main().catch(error => {
    logger.error('Error fatal en el script de pruebas:', error);
    process.exit(1);
  });
}

export { runPhoneNormalizationTests, testDuplicatePrevention };
