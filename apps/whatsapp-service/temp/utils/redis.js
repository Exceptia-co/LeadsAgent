"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
const redis_1 = require("redis");
const logger_1 = require("./logger");
class RedisManager {
    client;
    prefix;
    constructor() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        this.prefix = process.env.REDIS_PREFIX || 'whatsapp:';
        this.client = (0, redis_1.createClient)({ url: redisUrl });
        this.client.on('error', (err) => {
            logger_1.logger.error('Redis connection error:', err);
        });
        this.client.on('connect', () => {
            logger_1.logger.info('Redis connected successfully');
        });
    }
    async connect() {
        try {
            await this.client.connect();
        }
        catch (error) {
            logger_1.logger.error('Failed to connect to Redis:', error);
            throw error;
        }
    }
    async disconnect() {
        try {
            await this.client.disconnect();
        }
        catch (error) {
            logger_1.logger.error('Failed to disconnect from Redis:', error);
        }
    }
    getKey(key) {
        return `${this.prefix}${key}`;
    }
    async setSession(sessionId, data, ttl = 86400) {
        try {
            if (!this.client.isReady) {
                logger_1.logger.debug('Redis not ready, skipping session storage');
                return;
            }
            const key = this.getKey(`session:${sessionId}`);
            await this.client.setEx(key, ttl, JSON.stringify(data));
        }
        catch (error) {
            logger_1.logger.error('Error setting session in Redis:', error);
            // Don't throw error - continue without Redis
        }
    }
    async getSession(sessionId) {
        try {
            const key = this.getKey(`session:${sessionId}`);
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        }
        catch (error) {
            logger_1.logger.error('Error getting session from Redis:', error);
            return null;
        }
    }
    async deleteSession(sessionId) {
        try {
            const key = this.getKey(`session:${sessionId}`);
            await this.client.del(key);
        }
        catch (error) {
            logger_1.logger.error('Error deleting session from Redis:', error);
            throw error;
        }
    }
    async getAllSessions() {
        try {
            const pattern = this.getKey('session:*');
            const keys = await this.client.keys(pattern);
            const sessions = {};
            for (const key of keys) {
                const data = await this.client.get(key);
                if (data) {
                    const sessionId = key.replace(this.getKey('session:'), '');
                    sessions[sessionId] = JSON.parse(data);
                }
            }
            return sessions;
        }
        catch (error) {
            logger_1.logger.error('Error getting all sessions from Redis:', error);
            return {};
        }
    }
    async setQRCode(sessionId, qrCode, ttl = 300) {
        try {
            const key = this.getKey(`qr:${sessionId}`);
            await this.client.setEx(key, ttl, qrCode);
        }
        catch (error) {
            logger_1.logger.error('Error setting QR code in Redis:', error);
            throw error;
        }
    }
    async getQRCode(sessionId) {
        try {
            const key = this.getKey(`qr:${sessionId}`);
            return await this.client.get(key);
        }
        catch (error) {
            logger_1.logger.error('Error getting QR code from Redis:', error);
            return null;
        }
    }
    async deleteQRCode(sessionId) {
        try {
            const key = this.getKey(`qr:${sessionId}`);
            await this.client.del(key);
        }
        catch (error) {
            logger_1.logger.error('Error deleting QR code from Redis:', error);
        }
    }
}
const redis = new RedisManager();
exports.redis = redis;
exports.default = redis;
