import DatabaseService from '../src/services/DatabaseService';
import { logger } from '../src/utils/logger';

// Datos específicos del FAQ de EscortsHub
const knowledgeBaseEntries = [
  {
    category: 'productos',
    title: 'Productos Disponibles en EscortsHub',
    content: `En EscortsHub ofrecemos varios tipos de productos para maximizar tu visibilidad:

1. ANUNCIO DOBLE: Anuncio con visibilidad aumentada que ocupa doble espacio, ideal para escorts que buscan destacar entre los anuncios regulares.

2. ANUNCIO TOP: Anuncio destacado en posición superior con posicionamiento privilegiado en la parte superior de los listados, ideal para escorts que buscan máxima exposición.

3. ANUNCIO DOBLE TOP: Combinación de anuncio doble y posición top, ofrece máxima visibilidad y espacio destacado, ideal para escorts premium que buscan dominar los listados.

4. DISPONIBLE AHORA: Indicador de disponibilidad inmediata que muestra a los clientes que estás disponible en tiempo real.

5. HISTORIAS: Función para compartir contenido temporal que permite mostrar actualizaciones y contenido dinámico para mantener el perfil actualizado.

6. REACTIVACIÓN: Servicio para reactivar anuncios pausados, permite volver a activar anuncios anteriores, ideal para escorts que retoman su actividad.`,
    keywords: [
      'productos',
      'anuncio',
      'doble',
      'top',
      'disponible ahora',
      'historias',
      'reactivación',
      'servicios',
    ],
    priority: 10,
  },
  {
    category: 'precios',
    title: 'Precios en Monedas HUB',
    content: `Todos los productos se pagan con monedas HUB, la moneda virtual de la plataforma:

ANUNCIO DOBLE (base 11 monedas HUB):
- 1 día: 20 monedas HUB
- 5 días: 85 monedas HUB  
- 10 días: 150 monedas HUB

ANUNCIO TOP (base 28 monedas HUB):
- 3 días: 85 monedas HUB
- 7 días: 125 monedas HUB
- 10 días: 165 monedas HUB
- 30 días: 450 monedas HUB

ANUNCIO DOBLE TOP (base 59 monedas HUB):
- 3 días: 170 monedas HUB
- 7 días: 250 monedas HUB
- 10 días: 330 monedas HUB
- 30 días: 900 monedas HUB

DISPONIBLE AHORA (base 100 monedas HUB):
- 10 unidades: 40 monedas HUB
- 25 unidades: 100 monedas HUB
- 100 unidades: 400 monedas HUB

HISTORIAS (base 7 monedas HUB):
- 1 unidad: 12 monedas HUB
- 5 unidades: 60 monedas HUB
- 10 unidades: 110 monedas HUB

REACTIVACIÓN (base 10 monedas HUB):
- 1 unidad: 25 monedas HUB
- 5 unidades: 115 monedas HUB
- 10 unidades: 215 monedas HUB`,
    keywords: ['precios', 'costo', 'cuánto', 'monedas hub', 'pagar', 'precio', 'tarifa'],
    priority: 10,
  },
  {
    category: 'monedas',
    title: 'Sistema de Monedas HUB',
    content: `Las monedas HUB son la moneda virtual de EscortsHub:

¿QUÉ SON?: Moneda virtual utilizada para activar anuncios, se intercambia por días de activación y ofrece un sistema flexible para gestionar múltiples anuncios.

PAQUETES DE COMPRA:
- Paquete Básico: 100 monedas HUB por 80,00 EUR (0,80 € por moneda)
- Paquete Estándar: 200 monedas HUB por 150,00 EUR (0,75 € por moneda)  
- Paquete Plus: 500 monedas HUB por 300,00 EUR (0,60 € por moneda) ¡MEJOR PRECIO!
- Paquete Premium: 1.000 monedas HUB por 700,00 EUR (0,70 € por moneda)

BENEFICIOS POR PAQUETE:
- Básico: Ideal para probar el servicio o anuncios cortos
- Estándar: Mejor relación calidad-precio para uso regular
- Plus: Máximo ahorro por moneda (0,60€/moneda)
- Premium: Gran cantidad de monedas con buen descuento

WALLET (MONEDERO):
Disponible en tu dashboard para consultar saldo, historial de transacciones, recarga de monedas HUB y gestión de gastos.`,
    keywords: [
      'monedas hub',
      'paquetes',
      'comprar',
      'wallet',
      'monedero',
      'euros',
      'precio moneda',
      'compra',
    ],
    priority: 10,
  },
  {
    category: 'registro',
    title: 'Proceso de Registro en EscortsHub',
    content: `Para registrarte en EscortsHub sigue estos pasos sencillos:

PROCESO COMPLETO:
1. Visita nuestra web oficial: https://www.escortshub.net/es/sign-up
2. Completa el formulario de registro
3. Verifica tu correo electrónico
4. ¡Listo para empezar!

Una vez registrado/a podrás:
- Crear tu perfil
- Comprar monedas HUB
- Activar anuncios  
- Acceder a todas las funciones premium

REQUISITOS:
- Ser mayor de 18 años (obligatorio)
- Correo electrónico válido
- Aceptar términos y condiciones

El registro es GRATUITO. Solo pagas por los productos que actives con monedas HUB.`,
    keywords: [
      'registro',
      'registrarse',
      'cuenta',
      'crear perfil',
      'gratuito',
      'escortshub.net',
      'sign-up',
    ],
    priority: 9,
  },
  {
    category: 'pagos',
    title: 'Métodos de Pago Disponibles',
    content: `Aceptamos múltiples métodos de pago para tu comodidad:

MÉTODOS DISPONIBLES:
- Tarjetas de crédito/débito (Visa, Mastercard, etc.)
- Transferencia bancaria
- Métodos de pago digitales (PayPal, etc.)  
- Criptomonedas (consultar disponibilidad)

PROCESO DE PAGO:
1. Selecciona tu paquete de monedas HUB
2. Elige tu método de pago preferido
3. Completa la transacción segura
4. Las monedas se acreditan automáticamente en tu wallet

SEGURIDAD:
- Todos los pagos son procesados de forma segura
- Encriptación SSL en todas las transacciones
- Datos bancarios protegidos según estándares PCI-DSS`,
    keywords: [
      'pago',
      'métodos pago',
      'tarjeta',
      'transferencia',
      'paypal',
      'criptomonedas',
      'seguro',
    ],
    priority: 8,
  },
  {
    category: 'consejos',
    title: 'Consejos de Compra y Optimización',
    content: `Para aprovechar al máximo tu inversión en EscortsHub:

CONSEJOS ECONÓMICOS:
- Los paquetes de más días/unidades ofrecen mejor relación precio-beneficio
- El Paquete Plus de monedas HUB te da el mejor precio (0,60€ por moneda)
- El Anuncio Doble Top ofrece la máxima visibilidad combinando las ventajas del anuncio doble y top

ESTRATEGIAS DE VISIBILIDAD:
- Las Historias son ideales para mantener el perfil actualizado y dinámico
- El servicio "Disponible Ahora" es perfecto para gestionar la disponibilidad en tiempo real
- Combina diferentes productos según tu estrategia de marketing

RECOMENDACIONES:
- Empieza con el Paquete Estándar si eres nuevo
- Usa "Disponible Ahora" durante tus horas de trabajo
- Publica Historias regularmente para mantener engagement`,
    keywords: ['consejos', 'recomendaciones', 'estrategia', 'optimizar', 'mejor precio', 'tips'],
    priority: 7,
  },
];

async function updateKnowledgeBase(): Promise<void> {
  try {
    logger.info('🚀 Iniciando actualización de knowledge base...');

    // Inicializar tablas
    await DatabaseService.initializeTable();

    // Eliminar entradas existentes para evitar duplicados
    logger.info('🧹 Limpiando entradas existentes...');
    await DatabaseService.clearKnowledgeBase();

    // Agregar nuevas entradas
    logger.info('📚 Agregando nuevas entradas de knowledge base...');

    for (const entry of knowledgeBaseEntries) {
      await DatabaseService.addKnowledgeBase(entry);
      logger.info(`✅ Agregada entrada: ${entry.title}`);
    }

    logger.info('🎉 Knowledge base actualizada exitosamente!');
    logger.info(`📊 Total de entradas agregadas: ${knowledgeBaseEntries.length}`);

    // Mostrar estadísticas
    const stats = await DatabaseService.getKnowledgeBaseStats();
    logger.info('📈 Estadísticas de Knowledge Base:', stats);
  } catch (error) {
    logger.error('❌ Error actualizando knowledge base:', error);
    throw error;
  }
}

// Función principal
async function main() {
  try {
    await updateKnowledgeBase();
    process.exit(0);
  } catch (error) {
    logger.error('💥 Error fatal:', error);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main();
}

export { updateKnowledgeBase };
