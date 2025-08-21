"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const SessionController_1 = __importDefault(require("../controllers/SessionController"));
const validation_1 = require("../middleware/validation");
const router = (0, express_1.Router)();
// Apply rate limiting to all routes
router.use(validation_1.rateLimit);
// Health check
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'whatsapp-service',
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});
// Session routes
router.post('/sessions', validation_1.validateCreateSession, SessionController_1.default.createSession.bind(SessionController_1.default));
router.get('/sessions', SessionController_1.default.getAllSessions.bind(SessionController_1.default));
router.get('/sessions/:sessionId', validation_1.validateSessionId, SessionController_1.default.getSession.bind(SessionController_1.default));
router.delete('/sessions/:sessionId', validation_1.validateSessionId, SessionController_1.default.deleteSession.bind(SessionController_1.default));
// QR code route
router.get('/sessions/:sessionId/qr', validation_1.validateSessionId, SessionController_1.default.getQRCode.bind(SessionController_1.default));
// Message routes
router.post('/sessions/:sessionId/send', validation_1.validateSendMessage, SessionController_1.default.sendMessage.bind(SessionController_1.default));
// Analytics routes (for dashboard integration)
router.get('/whatsapp/sessions', SessionController_1.default.getAllSessions.bind(SessionController_1.default));
router.get('/whatsapp/analytics/messages', SessionController_1.default.getAnalytics.bind(SessionController_1.default));
exports.default = router;
