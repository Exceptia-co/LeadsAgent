"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionCleanupUtil = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../src/utils/logger");
class SessionCleanupUtil {
    /**
     * Limpia una sesión de WhatsApp de forma segura, manejando archivos bloqueados
     */
    static async cleanupSession(sessionId, sessionsPath = './sessions') {
        const sessionPath = path_1.default.join(sessionsPath, `session-${sessionId}`);
        if (!fs_1.default.existsSync(sessionPath)) {
            logger_1.logger.info(`Session ${sessionId} folder doesn't exist, nothing to cleanup`);
            return;
        }
        logger_1.logger.info(`Starting cleanup for session ${sessionId}`);
        // Primero, intentar eliminar archivos específicos que suelen causar problemas
        await this.cleanupSpecificFiles(sessionPath);
        // Luego, intentar eliminar toda la carpeta con reintentos
        await this.retryDelete(sessionPath, this.MAX_RETRIES);
        logger_1.logger.info(`Session ${sessionId} cleanup completed`);
    }
    /**
     * Limpia archivos específicos que suelen causar bloqueos
     */
    static async cleanupSpecificFiles(sessionPath) {
        const problematicFiles = [
            'lockfile',
            'LOCK',
            'first_party_sets.db',
            'first_party_sets.db-journal'
        ];
        for (const fileName of problematicFiles) {
            await this.deleteFileWithRetry(path_1.default.join(sessionPath, fileName));
        }
        // También limpiar archivos LOCK en subdirectorios
        await this.cleanupLockFiles(sessionPath);
    }
    /**
     * Elimina recursivamente archivos LOCK que pueden estar bloqueados
     */
    static async cleanupLockFiles(dirPath) {
        try {
            if (!fs_1.default.existsSync(dirPath))
                return;
            const items = fs_1.default.readdirSync(dirPath);
            for (const item of items) {
                const itemPath = path_1.default.join(dirPath, item);
                const stat = fs_1.default.statSync(itemPath);
                if (stat.isDirectory()) {
                    // Recursivamente limpiar subdirectorios
                    await this.cleanupLockFiles(itemPath);
                }
                else if (item === 'LOCK' || item === 'lockfile') {
                    await this.deleteFileWithRetry(itemPath);
                }
            }
        }
        catch (error) {
            logger_1.logger.warn(`Error cleaning lock files in ${dirPath}:`, error);
        }
    }
    /**
     * Elimina un archivo con reintentos
     */
    static async deleteFileWithRetry(filePath) {
        if (!fs_1.default.existsSync(filePath))
            return;
        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                fs_1.default.unlinkSync(filePath);
                logger_1.logger.debug(`Successfully deleted ${filePath} on attempt ${attempt}`);
                return;
            }
            catch (error) {
                if (error.code === 'EBUSY' || error.code === 'ENOENT') {
                    logger_1.logger.warn(`File ${filePath} is busy or not found (attempt ${attempt}/${this.MAX_RETRIES})`);
                    if (attempt < this.MAX_RETRIES) {
                        await this.delay(this.RETRY_DELAY * attempt);
                    }
                    else {
                        logger_1.logger.error(`Failed to delete ${filePath} after ${this.MAX_RETRIES} attempts:`, error);
                    }
                }
                else {
                    logger_1.logger.error(`Unexpected error deleting ${filePath}:`, error);
                    break;
                }
            }
        }
    }
    /**
     * Elimina un directorio con reintentos
     */
    static async retryDelete(dirPath, retries) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (fs_1.default.existsSync(dirPath)) {
                    fs_1.default.rmSync(dirPath, { recursive: true, force: true });
                    logger_1.logger.info(`Successfully deleted session directory on attempt ${attempt}`);
                    return;
                }
                else {
                    logger_1.logger.info('Session directory no longer exists, cleanup complete');
                    return;
                }
            }
            catch (error) {
                if (error.code === 'EBUSY') {
                    logger_1.logger.warn(`Directory is busy (attempt ${attempt}/${retries}), waiting before retry...`);
                    if (attempt < retries) {
                        await this.delay(this.RETRY_DELAY * attempt);
                    }
                    else {
                        logger_1.logger.error(`Failed to delete directory after ${retries} attempts. Manual cleanup may be required.`);
                        throw new Error(`Session cleanup failed after ${retries} attempts: ${error.message}`);
                    }
                }
                else {
                    logger_1.logger.error('Unexpected error during directory cleanup:', error);
                    throw error;
                }
            }
        }
    }
    /**
     * Utility para agregar delay
     */
    static async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Limpia todas las sesiones huérfanas (sin procesos asociados)
     */
    static async cleanupOrphanedSessions(sessionsPath = './sessions') {
        try {
            if (!fs_1.default.existsSync(sessionsPath)) {
                logger_1.logger.info('Sessions directory does not exist');
                return;
            }
            const sessionDirs = fs_1.default.readdirSync(sessionsPath)
                .filter(dir => dir.startsWith('session-'))
                .map(dir => path_1.default.join(sessionsPath, dir));
            logger_1.logger.info(`Found ${sessionDirs.length} session directories to check`);
            for (const sessionDir of sessionDirs) {
                const sessionId = path_1.default.basename(sessionDir).replace('session-', '');
                // Verificar si hay archivos LOCK antiguos (más de 1 hora)
                const hasOldLocks = await this.hasOldLockFiles(sessionDir);
                if (hasOldLocks) {
                    logger_1.logger.info(`Cleaning up orphaned session: ${sessionId}`);
                    await this.cleanupSession(sessionId, sessionsPath);
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Error during orphaned session cleanup:', error);
        }
    }
    /**
     * Verifica si una sesión tiene archivos LOCK antiguos
     */
    static async hasOldLockFiles(sessionDir) {
        try {
            const lockFiles = await this.findLockFiles(sessionDir);
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            for (const lockFile of lockFiles) {
                const stats = fs_1.default.statSync(lockFile);
                if (stats.mtime.getTime() < oneHourAgo) {
                    return true;
                }
            }
            return false;
        }
        catch (error) {
            logger_1.logger.warn(`Error checking lock files in ${sessionDir}:`, error);
            return false;
        }
    }
    /**
     * Encuentra todos los archivos LOCK en un directorio
     */
    static async findLockFiles(dirPath, lockFiles = []) {
        try {
            if (!fs_1.default.existsSync(dirPath))
                return lockFiles;
            const items = fs_1.default.readdirSync(dirPath);
            for (const item of items) {
                const itemPath = path_1.default.join(dirPath, item);
                const stat = fs_1.default.statSync(itemPath);
                if (stat.isDirectory()) {
                    await this.findLockFiles(itemPath, lockFiles);
                }
                else if (item === 'LOCK' || item === 'lockfile') {
                    lockFiles.push(itemPath);
                }
            }
        }
        catch (error) {
            logger_1.logger.warn(`Error finding lock files in ${dirPath}:`, error);
        }
        return lockFiles;
    }
    /**
     * Verifica el estado de las sesiones actualmente
     */
    static async getSessionsStatus(sessionsPath = './sessions') {
        try {
            if (!fs_1.default.existsSync(sessionsPath)) {
                return [];
            }
            const sessionDirs = fs_1.default.readdirSync(sessionsPath)
                .filter(dir => dir.startsWith('session-'));
            const sessionsStatus = [];
            for (const sessionDir of sessionDirs) {
                const sessionPath = path_1.default.join(sessionsPath, sessionDir);
                const sessionId = sessionDir.replace('session-', '');
                const lockFiles = await this.findLockFiles(sessionPath);
                const hasLocks = lockFiles.length > 0;
                // Obtener info del directorio
                const stat = fs_1.default.statSync(sessionPath);
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
        }
        catch (error) {
            logger_1.logger.error('Error getting sessions status:', error);
            return [];
        }
    }
    /**
     * Obtiene el tamaño de un directorio en KB
     */
    static async getDirectorySize(dirPath) {
        try {
            let totalSize = 0;
            const items = fs_1.default.readdirSync(dirPath);
            for (const item of items) {
                const itemPath = path_1.default.join(dirPath, item);
                const stat = fs_1.default.statSync(itemPath);
                if (stat.isDirectory()) {
                    totalSize += await this.getDirectorySize(itemPath);
                }
                else {
                    totalSize += stat.size;
                }
            }
            return Math.round(totalSize / 1024); // Convert to KB
        }
        catch (error) {
            return 0;
        }
    }
}
exports.SessionCleanupUtil = SessionCleanupUtil;
SessionCleanupUtil.MAX_RETRIES = 3;
SessionCleanupUtil.RETRY_DELAY = 2000; // 2 seconds
