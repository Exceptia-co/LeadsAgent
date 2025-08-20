"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionController = void 0;
const WhatsAppService_1 = __importDefault(require("../services/WhatsAppService"));
const logger_1 = require("../utils/logger");
class SessionController {
    // Create a new WhatsApp session
    async createSession(req, res) {
        try {
            const { sessionId } = req.body;
            if (!sessionId) {
                res.status(400).json({
                    success: false,
                    error: 'Session ID is required'
                });
                return;
            }
            const session = await WhatsAppService_1.default.createSession(sessionId);
            res.status(201).json({
                success: true,
                data: session
            });
        }
        catch (error) {
            logger_1.logger.error('Error creating session:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    // Get session status
    async getSession(req, res) {
        try {
            const { sessionId } = req.params;
            const session = await WhatsAppService_1.default.getSessionStatus(sessionId);
            if (!session) {
                res.status(404).json({
                    success: false,
                    error: 'Session not found'
                });
                return;
            }
            res.json({
                success: true,
                data: session
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting session:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    // Get all sessions
    async getAllSessions(req, res) {
        try {
            const sessions = await WhatsAppService_1.default.getAllSessions();
            res.json({
                success: true,
                data: sessions
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting all sessions:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    // Delete a session
    async deleteSession(req, res) {
        try {
            const { sessionId } = req.params;
            await WhatsAppService_1.default.destroySession(sessionId);
            res.json({
                success: true,
                message: `Session ${sessionId} deleted successfully`
            });
        }
        catch (error) {
            logger_1.logger.error('Error deleting session:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    // Get QR code for session
    async getQRCode(req, res) {
        try {
            const { sessionId } = req.params;
            const session = await WhatsAppService_1.default.getSessionStatus(sessionId);
            if (!session) {
                res.status(404).json({
                    success: false,
                    error: 'Session not found'
                });
                return;
            }
            if (!session.qrCode) {
                res.status(404).json({
                    success: false,
                    error: 'QR code not available. Session might be already authenticated or not connecting.'
                });
                return;
            }
            res.json({
                success: true,
                data: {
                    qrCode: session.qrCode,
                    status: session.status
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting QR code:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    // Send message
    async sendMessage(req, res) {
        try {
            const { sessionId } = req.params;
            const { to, message } = req.body;
            if (!to || !message) {
                res.status(400).json({
                    success: false,
                    error: 'Both "to" and "message" fields are required'
                });
                return;
            }
            const result = await WhatsAppService_1.default.sendMessage(sessionId, to, message);
            if (result.success) {
                res.json({
                    success: true,
                    data: result
                });
            }
            else {
                res.status(400).json({
                    success: false,
                    error: result.error
                });
            }
        }
        catch (error) {
            logger_1.logger.error('Error sending message:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    // Get analytics for dashboard integration
    async getAnalytics(req, res) {
        try {
            const sessions = await WhatsAppService_1.default.getAllSessions();
            // Mock analytics data for now
            // In a real implementation, this would come from a database
            const analytics = {
                total: {
                    messages: 0,
                    inbound: 0,
                    outbound: 0,
                    conversations: sessions.length
                },
                responseRate: '0%',
                sessions: sessions.length
            };
            res.json({
                success: true,
                ...analytics
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting analytics:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
exports.SessionController = SessionController;
exports.default = new SessionController();
