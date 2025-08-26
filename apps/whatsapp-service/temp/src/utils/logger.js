"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Ensure logs directory exists
const logsDir = path_1.default.join(process.cwd(), 'logs');
if (!fs_1.default.existsSync(logsDir)) {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
// Custom format for console
const consoleFormat = winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
}), winston_1.default.format.errors({ stack: true }), winston_1.default.format.printf(({ level, message, timestamp, stack }) => {
    if (stack) {
        return `[${timestamp}] ${level}: ${message}\n${stack}`;
    }
    return `[${timestamp}] ${level}: ${message}`;
}));
// File format (JSON for structured logging)
const fileFormat = winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json());
// Create Winston logger
const winstonLogger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: fileFormat,
    transports: [
        // Console transport
        new winston_1.default.transports.Console({
            format: consoleFormat,
            level: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
        }),
        // File transports
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ],
    exceptionHandlers: [
        new winston_1.default.transports.File({ filename: path_1.default.join(logsDir, 'exceptions.log') })
    ],
    rejectionHandlers: [
        new winston_1.default.transports.File({ filename: path_1.default.join(logsDir, 'rejections.log') })
    ]
});
// Create logger interface
exports.logger = {
    info: (message, meta) => winstonLogger.info(message, meta),
    error: (message, meta) => winstonLogger.error(message, meta),
    warn: (message, meta) => winstonLogger.warn(message, meta),
    debug: (message, meta) => winstonLogger.debug(message, meta),
    verbose: (message, meta) => winstonLogger.verbose(message, meta)
};
// Default export for backward compatibility
exports.default = exports.logger;
