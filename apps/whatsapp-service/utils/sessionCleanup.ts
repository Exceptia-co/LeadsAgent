import fs from 'fs';
import path from 'path';
import { logger } from '../src/utils/logger';

export class SessionCleanupUtil {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 2000; // 2 seconds

  /**
   * Limpia una sesión de WhatsApp de forma segura, manejando archivos bloqueados
   */
  static async cleanupSession(sessionId: string, sessionsPath: string = './sessions'): Promise<void> {
    const sessionPath = path.join(sessionsPath, `session-${sessionId}`);
    
    if (!fs.existsSync(sessionPath)) {
      logger.info(`Session ${sessionId} folder doesn't exist, nothing to cleanup`);
      return;
    }

    logger.info(`Starting cleanup for session ${sessionId}`);

    // Primero, intentar eliminar archivos específicos que suelen causar problemas
    await this.cleanupSpecificFiles(sessionPath);
    
    // Luego, intentar eliminar toda la carpeta con reintentos
    await this.retryDelete(sessionPath, this.MAX_RETRIES);
    
    logger.info(`Session ${sessionId} cleanup completed`);
  }

  /**
   * Limpia archivos específicos que suelen causar bloqueos
   */
  private static async cleanupSpecificFiles(sessionPath: string): Promise<void> {
    const problematicFiles = [
      'lockfile',
      'LOCK',
      'first_party_sets.db',
      'first_party_sets.db-journal'
    ];

    for (const fileName of problematicFiles) {
      await this.deleteFileWithRetry(path.join(sessionPath, fileName));
    }

    // También limpiar archivos LOCK en subdirectorios
    await this.cleanupLockFiles(sessionPath);
  }

  /**
   * Elimina recursivamente archivos LOCK que pueden estar bloqueados
   */
  private static async cleanupLockFiles(dirPath: string): Promise<void> {
    try {
      if (!fs.existsSync(dirPath)) return;

      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          // Recursivamente limpiar subdirectorios
          await this.cleanupLockFiles(itemPath);
        } else if (item === 'LOCK' || item === 'lockfile') {
          await this.deleteFileWithRetry(itemPath);
        }
      }
    } catch (error) {
      logger.warn(`Error cleaning lock files in ${dirPath}:`, error);
    }
  }

  /**
   * Elimina un archivo con reintentos
   */
  private static async deleteFileWithRetry(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) return;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        fs.unlinkSync(filePath);
        logger.debug(`Successfully deleted ${filePath} on attempt ${attempt}`);
        return;
      } catch (error: any) {
        if (error.code === 'EBUSY' || error.code === 'ENOENT') {
          logger.warn(`File ${filePath} is busy or not found (attempt ${attempt}/${this.MAX_RETRIES})`);
          
          if (attempt < this.MAX_RETRIES) {
            await this.delay(this.RETRY_DELAY * attempt);
          } else {
            logger.error(`Failed to delete ${filePath} after ${this.MAX_RETRIES} attempts:`, error);
          }
        } else {
          logger.error(`Unexpected error deleting ${filePath}:`, error);
          break;
        }
      }
    }
  }

  /**
   * Elimina un directorio con reintentos
   */
  private static async retryDelete(dirPath: string, retries: number): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
          logger.info(`Successfully deleted session directory on attempt ${attempt}`);
          return;
        } else {
          logger.info('Session directory no longer exists, cleanup complete');
          return;
        }
      } catch (error: any) {
        if (error.code === 'EBUSY') {
          logger.warn(`Directory is busy (attempt ${attempt}/${retries}), waiting before retry...`);
          
          if (attempt < retries) {
            await this.delay(this.RETRY_DELAY * attempt);
          } else {
            logger.error(`Failed to delete directory after ${retries} attempts. Manual cleanup may be required.`);
            throw new Error(`Session cleanup failed after ${retries} attempts: ${error.message}`);
          }
        } else {
          logger.error('Unexpected error during directory cleanup:', error);
          throw error;
        }
      }
    }
  }

  /**
   * Utility para agregar delay
   */
  private static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Limpia todas las sesiones huérfanas (sin procesos asociados)
   */
  static async cleanupOrphanedSessions(sessionsPath: string = './sessions'): Promise<void> {
    try {
      if (!fs.existsSync(sessionsPath)) {
        logger.info('Sessions directory does not exist');
        return;
      }

      const sessionDirs = fs.readdirSync(sessionsPath)
        .filter(dir => dir.startsWith('session-'))
        .map(dir => path.join(sessionsPath, dir));

      logger.info(`Found ${sessionDirs.length} session directories to check`);

      for (const sessionDir of sessionDirs) {
        const sessionId = path.basename(sessionDir).replace('session-', '');
        
        // Verificar si hay archivos LOCK antiguos (más de 1 hora)
        const hasOldLocks = await this.hasOldLockFiles(sessionDir);
        
        if (hasOldLocks) {
          logger.info(`Cleaning up orphaned session: ${sessionId}`);
          await this.cleanupSession(sessionId, sessionsPath);
        }
      }
    } catch (error) {
      logger.error('Error during orphaned session cleanup:', error);
    }
  }

  /**
   * Verifica si una sesión tiene archivos LOCK antiguos
   */
  private static async hasOldLockFiles(sessionDir: string): Promise<boolean> {
    try {
      const lockFiles = await this.findLockFiles(sessionDir);
      const oneHourAgo = Date.now() - (60 * 60 * 1000);

      for (const lockFile of lockFiles) {
        const stats = fs.statSync(lockFile);
        if (stats.mtime.getTime() < oneHourAgo) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      logger.warn(`Error checking lock files in ${sessionDir}:`, error);
      return false;
    }
  }

  /**
   * Encuentra todos los archivos LOCK en un directorio
   */
  private static async findLockFiles(dirPath: string, lockFiles: string[] = []): Promise<string[]> {
    try {
      if (!fs.existsSync(dirPath)) return lockFiles;

      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          await this.findLockFiles(itemPath, lockFiles);
        } else if (item === 'LOCK' || item === 'lockfile') {
          lockFiles.push(itemPath);
        }
      }
    } catch (error) {
      logger.warn(`Error finding lock files in ${dirPath}:`, error);
    }
    
    return lockFiles;
  }

  /**
   * Verifica el estado de las sesiones actualmente
   */
  static async getSessionsStatus(sessionsPath: string = './sessions'): Promise<any[]> {
    try {
      if (!fs.existsSync(sessionsPath)) {
        return [];
      }

      const sessionDirs = fs.readdirSync(sessionsPath)
        .filter(dir => dir.startsWith('session-'));

      const sessionsStatus = [];

      for (const sessionDir of sessionDirs) {
        const sessionPath = path.join(sessionsPath, sessionDir);
        const sessionId = sessionDir.replace('session-', '');
        
        const lockFiles = await this.findLockFiles(sessionPath);
        const hasLocks = lockFiles.length > 0;
        
        // Obtener info del directorio
        const stat = fs.statSync(sessionPath);
        
        sessionsStatus.push({
          sessionId,
          path: sessionPath,
          hasLockFiles: hasLocks,
          lockFilesCount: lockFiles.length,
          lastModified: stat.mtime,
          sizeKB: await this.getDirectorySize(sessionPath)
        });
      }

      return sessionsStatus;
    } catch (error) {
      logger.error('Error getting sessions status:', error);
      return [];
    }
  }

  /**
   * Obtiene el tamaño de un directorio en KB
   */
  private static async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;
      
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath);
        } else {
          totalSize += stat.size;
        }
      }
      
      return Math.round(totalSize / 1024); // Convert to KB
    } catch (error) {
      return 0;
    }
  }
}
