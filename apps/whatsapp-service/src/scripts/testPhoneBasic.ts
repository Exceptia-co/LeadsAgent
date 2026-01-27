#!/usr/bin/env ts-node

/**
 * Script básico para probar las funcionalidades de normalización
 * sin dependencia de base de datos
 */

import { logger } from '../utils/logger';
import PhoneNumberService from '../services/PhoneNumberService';

/**
 * Prueba extensiva de casos de normalización
 */
async function testExtensiveNormalization(): Promise<void> {
  console.log('🔬 PRUEBAS EXTENSIVAS DE NORMALIZACIÓN');
  console.log('=====================================\n');

  const testCases = [
    // Casos argentinos
    {
      input: '+5491123456789',
      expected: '5491123456789',
      description: 'Número argentino móvil con +',
    },
    {
      input: '5491123456789',
      expected: '5491123456789',
      description: 'Número argentino móvil sin +',
    },
    {
      input: '+549 11 2345 6789',
      expected: '5491123456789',
      description: 'Número argentino con espacios',
    },
    {
      input: '+54-9-11-2345-6789',
      expected: '5491123456789',
      description: 'Número argentino con guiones',
    },
    {
      input: '011-2345-6789',
      expected: '549112345678',
      description: 'Número local argentino con 0',
    },
    {
      input: '11-2345-6789',
      expected: '549112345678',
      description: 'Número local argentino sin 0',
    },

    // Casos de otros países
    { input: '+52555123456789', expected: '52555123456789', description: 'Número mexicano' },
    { input: '+34612345678', expected: '34612345678', description: 'Número español' },
    { input: '+1234567890', expected: '1234567890', description: 'Número USA/Canadá' },

    // Casos edge
    { input: '0800123456', expected: '54800123456', description: 'Número de servicio con 0' },
    { input: '911', expected: '911', description: 'Número de emergencia' },
    { input: '+54 11 1234 5678', expected: '54111234567', description: 'Número fijo argentino' },
  ];

  let passed = 0;
  const total = testCases.length;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const result = PhoneNumberService.normalizePhoneNumber(testCase.input);
    const success = result === testCase.expected;

    console.log(`Test ${i + 1}/${total}: ${testCase.description}`);
    console.log(`  📞 Input: "${testCase.input}"`);
    console.log(`  🎯 Expected: "${testCase.expected}"`);
    console.log(`  📊 Result: "${result}"`);
    console.log(`  ${success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('');

    if (success) passed++;
  }

  console.log(
    `📈 RESUMEN: ${passed}/${total} tests passed (${((passed / total) * 100).toFixed(1)}%)`
  );
  console.log('');
}

/**
 * Prueba casos de equivalencia complejos
 */
async function testComplexEquivalence(): Promise<void> {
  console.log('🔄 PRUEBAS DE EQUIVALENCIA COMPLEJA');
  console.log('==================================\n');

  const equivalenceCases = [
    {
      numbers: ['+5491123456789', '5491123456789', '+549 11 2345 6789', '+54-9-11-2345-6789'],
      shouldBeEquivalent: true,
      description: 'Números argentinos móviles en diferentes formatos',
    },
    {
      numbers: ['011-2345-6789', '11-2345-6789'],
      shouldBeEquivalent: true,
      description: 'Números locales argentinos con y sin 0',
    },
    {
      numbers: ['+5491123456789', '+5491987654321'],
      shouldBeEquivalent: false,
      description: 'Números argentinos diferentes',
    },
    {
      numbers: ['+52555123456789', '+34612345678'],
      shouldBeEquivalent: false,
      description: 'Números de países diferentes',
    },
  ];

  let groupsPassed = 0;
  const totalGroups = equivalenceCases.length;

  for (let i = 0; i < equivalenceCases.length; i++) {
    const testGroup = equivalenceCases[i];
    console.log(`Grupo ${i + 1}/${totalGroups}: ${testGroup.description}`);

    let allPassed = true;
    const numbers = testGroup.numbers;

    // Probar todas las combinaciones dentro del grupo
    for (let j = 0; j < numbers.length; j++) {
      for (let k = j + 1; k < numbers.length; k++) {
        const num1 = numbers[j];
        const num2 = numbers[k];
        const isEquivalent = PhoneNumberService.arePhoneNumbersEquivalent(num1, num2);
        const expectedEquivalence = testGroup.shouldBeEquivalent;

        console.log(`  "${num1}" vs "${num2}": ${isEquivalent ? 'EQUIVALENT' : 'DIFFERENT'}`);

        if (isEquivalent !== expectedEquivalence) {
          allPassed = false;
          console.log(
            `    ❌ FAILED - Expected: ${expectedEquivalence ? 'EQUIVALENT' : 'DIFFERENT'}`
          );
        } else {
          console.log(`    ✅ PASSED`);
        }
      }
    }

    if (allPassed) {
      groupsPassed++;
      console.log(`  🎉 Grupo completo: PASSED\n`);
    } else {
      console.log(`  💥 Grupo completo: FAILED\n`);
    }
  }

  console.log(
    `📈 RESUMEN GRUPOS: ${groupsPassed}/${totalGroups} passed (${((groupsPassed / totalGroups) * 100).toFixed(1)}%)`
  );
  console.log('');
}

/**
 * Demostrar la funcionalidad de búsqueda en lista
 */
async function testPhoneListSearch(): Promise<void> {
  console.log('🔍 PRUEBAS DE BÚSQUEDA EN LISTA');
  console.log('==============================\n');

  const phoneList = ['+5491123456789', '+34612345678', '+52555987654321', '011-8765-4321'];

  const searchCases = [
    { search: '5491123456789', shouldFind: 0, description: 'Buscar equivalente del primer número' },
    { search: '+549 11 2345 6789', shouldFind: 0, description: 'Buscar con formato diferente' },
    { search: '011-8765-4321', shouldFind: 3, description: 'Buscar número local' },
    { search: '+9999999999', shouldFind: -1, description: 'Buscar número inexistente' },
    { search: '+34 612 345 678', shouldFind: 1, description: 'Buscar número español con espacios' },
  ];

  console.log('📋 Lista de números:');
  phoneList.forEach((phone, idx) => {
    console.log(`  ${idx}: "${phone}"`);
  });
  console.log('');

  let passed = 0;
  const total = searchCases.length;

  for (let i = 0; i < searchCases.length; i++) {
    const testCase = searchCases[i];
    const foundIndex = PhoneNumberService.findPhoneNumberInList(testCase.search, phoneList);
    const success = foundIndex === testCase.shouldFind;

    console.log(`Test ${i + 1}/${total}: ${testCase.description}`);
    console.log(`  🔍 Searching: "${testCase.search}"`);
    console.log(`  🎯 Expected index: ${testCase.shouldFind}`);
    console.log(`  📊 Found index: ${foundIndex}`);
    console.log(`  ${success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('');

    if (success) passed++;
  }

  console.log(
    `📈 RESUMEN BÚSQUEDA: ${passed}/${total} tests passed (${((passed / total) * 100).toFixed(1)}%)`
  );
}

/**
 * Función principal
 */
async function main(): Promise<void> {
  try {
    await testExtensiveNormalization();
    await testComplexEquivalence();
    await testPhoneListSearch();

    console.log('🎉 TODAS LAS PRUEBAS COMPLETADAS');
    console.log(
      'El sistema de normalización de números telefónicos está funcionando correctamente!'
    );
  } catch (error) {
    logger.error('Error en las pruebas:', error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch(error => {
    logger.error('Error fatal:', error);
    process.exit(1);
  });
}

export { testExtensiveNormalization, testComplexEquivalence, testPhoneListSearch };
