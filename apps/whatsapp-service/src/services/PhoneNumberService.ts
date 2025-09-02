import { logger } from '../utils/logger';

/**
 * PhoneNumberService - Servicio para normalizar y comparar números telefónicos
 * 
 * Este servicio proporciona funciones para normalizar números telefónicos a un
 * formato estándar y comparar números con diferentes formatos para determinar
 * si son el mismo número.
 */
export class PhoneNumberService {
  
  /**
   * Normaliza un número telefónico eliminando caracteres no numéricos y
   * manejando códigos de país comunes.
   * 
   * @param phoneNumber - El número telefónico a normalizar
   * @returns El número normalizado en formato E.164 sin el signo +
   */
  public static normalizePhoneNumber(phoneNumber: string): string {
    if (!phoneNumber) {
      return '';
    }
    
    try {
      // Eliminar todos los caracteres no numéricos
      let cleaned = phoneNumber.replace(/[^0-9]/g, '');
      
      // Si el número empieza con 0, lo eliminamos (prefijo local en muchos países)
      if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
      }
      
      // Detectar y manejar prefijos de países comunes
      // Prefijos de países de LATAM y España principalmente
      const countryCodes: { [key: string]: string } = {
        '54': 'Argentina',
        '55': 'Brasil',
        '56': 'Chile',
        '57': 'Colombia',
        '506': 'Costa Rica',
        '593': 'Ecuador',
        '503': 'El Salvador',
        '34': 'España',
        '502': 'Guatemala',
        '504': 'Honduras',
        '52': 'México',
        '505': 'Nicaragua',
        '507': 'Panamá',
        '595': 'Paraguay',
        '51': 'Perú',
        '1': 'USA/Canadá',
        '598': 'Uruguay',
        '58': 'Venezuela'
      };
      
      // Verificar si ya tiene código de país
      let hasCountryCode = false;
      for (const code of Object.keys(countryCodes)) {
        if (cleaned.startsWith(code)) {
          // Si el número ya tiene código de país, lo dejamos como está
          hasCountryCode = true;
          break;
        }
      }
      
      // Para números argentinos, manejar el prefijo 9 después del código de país
      // Ejemplo: +5491123456789 (donde 9 es el prefijo para móviles)
      if (cleaned.startsWith('549') && cleaned.length >= 12) {
        // Asegurarse de que el 9 esté presente
        return cleaned;
      }
      
      // Si no tiene código de país y tiene 10 dígitos, asumimos que es
      // un número local y agregamos el código predeterminado (configurable)
      // En este caso usamos 54 (Argentina) como predeterminado
      if (!hasCountryCode && (cleaned.length === 10 || cleaned.length === 8)) {
        const defaultCountryCode = process.env.DEFAULT_COUNTRY_CODE || '54';
        // Para Argentina, si es un celular, agregamos el 9 después del código de país
        if (defaultCountryCode === '54' && cleaned.length === 10 && cleaned.startsWith('11')) {
          cleaned = `${defaultCountryCode}9${cleaned}`;
        } else {
          cleaned = `${defaultCountryCode}${cleaned}`;
        }
      }
      
      return cleaned;
    } catch (error) {
      logger.error(`Error al normalizar número telefónico: ${phoneNumber}`, error);
      // En caso de error, devolvemos el número limpio básico
      return phoneNumber.replace(/[^0-9]/g, '');
    }
  }
  
  /**
   * Compara dos números telefónicos para determinar si son el mismo
   * 
   * @param phone1 - Primer número telefónico
   * @param phone2 - Segundo número telefónico
   * @returns true si los números son equivalentes, false en caso contrario
   */
  public static arePhoneNumbersEquivalent(phone1: string, phone2: string): boolean {
    if (!phone1 || !phone2) {
      return false;
    }
    
    try {
      // Normalizar ambos números
      const normalized1 = this.normalizePhoneNumber(phone1);
      const normalized2 = this.normalizePhoneNumber(phone2);
      
      // Comparar los números normalizados
      if (normalized1 === normalized2) {
        return true;
      }
      
      // Si son de diferentes longitudes, podemos hacer comparaciones adicionales
      // Esto es útil para comparar números con y sin código de país
      
      // 1. Comparar los últimos 10 dígitos (número local)
      const last10of1 = normalized1.slice(-10);
      const last10of2 = normalized2.slice(-10);
      
      if (last10of1 === last10of2 && last10of1.length === 10) {
        return true;
      }
      
      // 2. Comparar los últimos 8 dígitos (para números locales sin prefijo de área)
      const last8of1 = normalized1.slice(-8);
      const last8of2 = normalized2.slice(-8);
      
      if (last8of1 === last8of2 && last8of1.length === 8) {
        return true;
      }
      
      // Si ninguna comparación coincide, los números son diferentes
      return false;
    } catch (error) {
      logger.error(`Error al comparar números telefónicos: ${phone1} y ${phone2}`, error);
      return false;
    }
  }
  
  /**
   * Verifica si un número está en una lista de números telefónicos
   * 
   * @param phoneNumber - Número a buscar
   * @param phoneNumberList - Lista de números donde buscar
   * @returns El índice del número equivalente en la lista, o -1 si no se encuentra
   */
  public static findPhoneNumberInList(
    phoneNumber: string, 
    phoneNumberList: string[]
  ): number {
    if (!phoneNumber || !phoneNumberList || phoneNumberList.length === 0) {
      return -1;
    }
    
    // Normalizar el número de búsqueda
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    
    // Buscar en la lista
    for (let i = 0; i < phoneNumberList.length; i++) {
      if (this.arePhoneNumbersEquivalent(normalizedPhone, phoneNumberList[i])) {
        return i;
      }
    }
    
    return -1;
  }
  
  /**
   * Verifica si un número de teléfono está autorizado para respuesta automática
   * 
   * @param phoneNumber - Número de teléfono a verificar
   * @returns true si está autorizado, false en caso contrario
   */
  public static async checkPhoneNumberAllowed(phoneNumber: string): Promise<boolean> {
    try {
      // Import WhatsAppAuthorizationService dynamically to avoid circular dependencies
      const { default: WhatsAppAuthorizationService } = await import('./WhatsAppAuthorizationService');
      
      // Usar el servicio de autorización para verificar el número
      const authorizationResult = await WhatsAppAuthorizationService.authorize({
        phoneNumber,
        sessionId: 'phone-validation',
        timestamp: new Date(),
      });
      
      return authorizationResult.decision === 'ALLOWED';
    } catch (error) {
      logger.error('Error checking phone number authorization:', error);
      // En caso de error, comportamiento conservador (BLOQUEAR)
      return false;
    }
  }
}

export default PhoneNumberService;
