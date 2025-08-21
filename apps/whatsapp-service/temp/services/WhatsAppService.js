"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const whatsapp_web_js_1 = require("whatsapp-web.js");
const qrcode_terminal_1 = __importDefault(require("qrcode-terminal"));
const logger_1 = require("../utils/logger");
const redis_1 = require("../utils/redis");
class WhatsAppService {
    clients = new Map();
    sessions = new Map();
    webhookUrl;
    constructor() {
        this.webhookUrl = process.env.WEBHOOK_URL;
    }
    async initialize() {
        try {
            // Try to connect to Redis, but don't fail if it's not available in development
            if (process.env.REDIS_URL && process.env.REDIS_URL !== 'redis://localhost:6379') {
                await redis_1.redis.connect();
                logger_1.logger.info('Connected to Redis');
            }
            else {
                logger_1.logger.warn('Redis not configured or not available - running without Redis');
            }
            logger_1.logger.info('WhatsApp service initialized successfully');
        }
        catch (error) {
            logger_1.logger.warn('Redis connection failed, continuing without Redis:', error instanceof Error ? error.message : String(error));
        }
    }
    async createSession(sessionId) {
        try {
            if (this.clients.has(sessionId)) {
                throw new Error(`Session ${sessionId} already exists`);
            }
            // Create WhatsApp client with session authentication
            const client = new whatsapp_web_js_1.Client({
                authStrategy: new whatsapp_web_js_1.LocalAuth({
                    clientId: sessionId,
                    dataPath: './sessions'
                }),
                puppeteer: {
                    headless: process.env.NODE_ENV === 'production',
                    executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu',
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor'
                    ]
                }
            });
            // Create session object
            const session = {
                id: sessionId,
                clientId: sessionId,
                status: 'connecting',
                lastSeen: new Date(),
                webhookUrl: this.webhookUrl
            };
            // Set up event listeners
            this.setupClientEventListeners(client, sessionId);
            // Store client and session
            this.clients.set(sessionId, client);
            this.sessions.set(sessionId, session);
            // Store in Redis
            await redis_1.redis.setSession(sessionId, session);
            // Initialize the client
            client.initialize();
            logger_1.logger.info(`WhatsApp session ${sessionId} created successfully`);
            return session;
        }
        catch (error) {
            logger_1.logger.error(`Error creating session ${sessionId}:`, error);
            throw error;
        }
    }
    setupClientEventListeners(client, sessionId) {
        // QR Code event
        client.on('qr', async (qr) => {
            logger_1.logger.info(`QR Code generated for session ${sessionId}`);
            // Generate QR code for terminal display (development)
            if (process.env.NODE_ENV !== 'production') {
                qrcode_terminal_1.default.generate(qr, { small: true });
            }
            // Store QR code in Redis and session
            await redis_1.redis.setQRCode(sessionId, qr);
            await this.updateSessionStatus(sessionId, 'connecting', { qrCode: qr });
            // Send webhook
            await this.sendWebhook({
                event: 'qr_updated',
                sessionId,
                data: { qrCode: qr },
                timestamp: new Date().toISOString()
            });
        });
        // Ready event
        client.on('ready', async () => {
            logger_1.logger.info(`WhatsApp client ${sessionId} is ready`);
            const clientInfo = client.info;
            await redis_1.redis.deleteQRCode(sessionId);
            await this.updateSessionStatus(sessionId, 'ready', {
                connectedNumber: clientInfo?.wid?.user || 'unknown'
            });
            // Send webhook
            await this.sendWebhook({
                event: 'authenticated',
                sessionId,
                data: { number: clientInfo?.wid?.user },
                timestamp: new Date().toISOString()
            });
        });
        // Authenticated event
        client.on('authenticated', async () => {
            logger_1.logger.info(`WhatsApp client ${sessionId} authenticated`);
            await this.updateSessionStatus(sessionId, 'authenticated');
        });
        // Authentication failure event
        client.on('auth_failure', async (msg) => {
            logger_1.logger.error(`Authentication failed for session ${sessionId}:`, msg);
            await redis_1.redis.deleteQRCode(sessionId);
            await this.updateSessionStatus(sessionId, 'auth_failure');
            // Send webhook
            await this.sendWebhook({
                event: 'status_change',
                sessionId,
                data: { status: 'auth_failure', message: msg },
                timestamp: new Date().toISOString()
            });
        });
        // Disconnected event
        client.on('disconnected', async (reason) => {
            logger_1.logger.info(`WhatsApp client ${sessionId} disconnected:`, reason);
            await this.updateSessionStatus(sessionId, 'disconnected');
            // Send webhook
            await this.sendWebhook({
                event: 'disconnected',
                sessionId,
                data: { reason },
                timestamp: new Date().toISOString()
            });
        });
        // Message event
        client.on('message', async (message) => {
            try {
                const whatsappMessage = await this.parseMessage(message, sessionId);
                logger_1.logger.info(`Message received in session ${sessionId}:`, {
                    from: whatsappMessage.from,
                    body: whatsappMessage.body.substring(0, 100)
                });
                // Send webhook with message
                await this.sendWebhook({
                    event: 'message',
                    sessionId,
                    data: whatsappMessage,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                logger_1.logger.error(`Error processing message in session ${sessionId}:`, error);
            }
        });
    }
    async parseMessage(message, sessionId) {
        const contact = await message.getContact();
        const chat = await message.getChat();
        return {
            id: message.id._serialized,
            from: contact.id._serialized,
            to: message.to,
            body: message.body,
            timestamp: message.timestamp,
            type: message.type,
            isGroup: chat.isGroup,
            fromMe: message.fromMe
        };
    }
    async sendMessage(sessionId, to, message) {
        try {
            const client = this.clients.get(sessionId);
            if (!client) {
                return {
                    success: false,
                    error: `Session ${sessionId} not found`
                };
            }
            const session = this.sessions.get(sessionId);
            if (!session || session.status !== 'ready') {
                return {
                    success: false,
                    error: `Session ${sessionId} is not ready. Status: ${session?.status || 'not found'}`
                };
            }
            // Format phone number (ensure it includes country code)
            const formattedNumber = to.includes('@c.us') ? to : `${to}@c.us`;
            const sentMessage = await client.sendMessage(formattedNumber, message);
            logger_1.logger.info(`Message sent successfully in session ${sessionId}`, {
                to: formattedNumber,
                messageId: sentMessage.id._serialized
            });
            return {
                success: true,
                messageId: sentMessage.id._serialized
            };
        }
        catch (error) {
            logger_1.logger.error(`Error sending message in session ${sessionId}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    async getSessionStatus(sessionId) {
        return this.sessions.get(sessionId) || await redis_1.redis.getSession(sessionId);
    }
    async getAllSessions() {
        const sessions = [];
        // Get from memory
        this.sessions.forEach(session => sessions.push(session));
        // Get from Redis (for sessions not in memory)
        const redisSessions = await redis_1.redis.getAllSessions();
        Object.values(redisSessions).forEach(session => {
            if (!sessions.find(s => s.id === session.id)) {
                sessions.push(session);
            }
        });
        return sessions;
    }
    async destroySession(sessionId) {
        try {
            const client = this.clients.get(sessionId);
            if (client) {
                await client.destroy();
                this.clients.delete(sessionId);
            }
            this.sessions.delete(sessionId);
            await redis_1.redis.deleteSession(sessionId);
            await redis_1.redis.deleteQRCode(sessionId);
            logger_1.logger.info(`Session ${sessionId} destroyed successfully`);
        }
        catch (error) {
            logger_1.logger.error(`Error destroying session ${sessionId}:`, error);
            throw error;
        }
    }
    async updateSessionStatus(sessionId, status, data) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.status = status;
            session.lastSeen = new Date();
            if (data) {
                Object.assign(session, data);
            }
            await redis_1.redis.setSession(sessionId, session);
        }
    }
    async sendWebhook(payload) {
        if (!this.webhookUrl) {
            logger_1.logger.debug('No webhook URL configured, skipping webhook');
            return;
        }
        try {
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-WhatsApp-Service': 'true'
                },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(`Webhook failed with status: ${response.status}`);
            }
            logger_1.logger.debug(`Webhook sent successfully for event ${payload.event}`);
        }
        catch (error) {
            logger_1.logger.error('Error sending webhook:', error);
        }
    }
    async shutdown() {
        logger_1.logger.info('Shutting down WhatsApp service...');
        const destroyPromises = Array.from(this.clients.keys()).map(sessionId => this.destroySession(sessionId).catch(error => logger_1.logger.error(`Error destroying session ${sessionId} during shutdown:`, error)));
        await Promise.all(destroyPromises);
        await redis_1.redis.disconnect();
        logger_1.logger.info('WhatsApp service shutdown completed');
    }
}
exports.default = new WhatsAppService();
