"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var cors_1 = require("cors");
var dotenv_1 = require("dotenv");
var routes_1 = require("./routes");
var logger_1 = require("./utils/logger");
var fs_1 = require("fs");
// Load environment variables
dotenv_1.default.config();
var app = (0, express_1.default)();
var PORT = process.env.PORT || 3002;
// Ensure required directories exist
var requiredDirs = ['./sessions', './logs'];
requiredDirs.forEach(function (dir) {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
        logger_1.default.info("Created directory: ".concat(dir));
    }
});
// Middleware
app.use((0, cors_1.default)({
    origin: ((_a = process.env.CORS_ORIGINS) === null || _a === void 0 ? void 0 : _a.split(',')) || ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Request logging middleware
app.use(function (req, res, next) {
    var start = Date.now();
    res.on('finish', function () {
        var duration = Date.now() - start;
        logger_1.default.info("".concat(req.method, " ").concat(req.path), {
            status: res.statusCode,
            duration: "".concat(duration, "ms"),
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
    });
    next();
});
// API routes
app.use('/api/v1', routes_1.default);
// Root endpoint
app.get('/', function (req, res) {
    res.json({
        service: 'LeadsCRM WhatsApp Service',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/api/v1/health',
            sessions: '/api/v1/sessions',
            createSession: 'POST /api/v1/sessions',
            getSession: 'GET /api/v1/sessions/:sessionId',
            deleteSession: 'DELETE /api/v1/sessions/:sessionId',
            getQRCode: 'GET /api/v1/sessions/:sessionId/qr',
            sendMessage: 'POST /api/v1/sessions/:sessionId/send'
        }
    });
});
// Error handling middleware
app.use(function (err, req, res, next) {
    logger_1.default.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});
// 40
