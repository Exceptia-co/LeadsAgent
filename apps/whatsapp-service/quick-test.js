const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3002;

// Middleware
app.use(express.json());

// Global sessions store
const sessions = new Map();

// Ensure sessions directory exists
const sessionsDir = './sessions';
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

console.log('🚀 Starting WhatsApp Service...');

// Helper to create WhatsApp client
function createWhatsAppClient(sessionId) {
    console.log(`Creating WhatsApp client for session: ${sessionId}`);
    
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: sessionId,
            dataPath: './sessions'
        }),
        puppeteer: {
            headless: false,  // Make it visible for debugging
            executablePath: process.env.CHROME_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        }
    });

    let qrCode = null;

    client.on('qr', (qr) => {
        console.log(`✅ QR Code generated for session ${sessionId}`);
        qrCode = qr;
    });

    client.on('ready', () => {
        console.log(`✅ WhatsApp client ready for session: ${sessionId}`);
    });

    client.on('authenticated', () => {
        console.log(`✅ WhatsApp authenticated for session: ${sessionId}`);
    });

    client.on('auth_failure', (msg) => {
        console.log(`❌ Authentication failed for session ${sessionId}:`, msg);
    });

    client.on('disconnected', (reason) => {
        console.log(`❌ WhatsApp disconnected for session ${sessionId}:`, reason);
    });

    // Initialize client
    client.initialize().catch(err => {
        console.error(`Error initializing client for session ${sessionId}:`, err);
    });

    return { client, getQR: () => qrCode };
}

// Routes
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/sessions', (req, res) => {
    const { sessionId } = req.body;
    
    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    if (sessions.has(sessionId)) {
        return res.status(409).json({ error: 'Session already exists' });
    }

    try {
        const sessionData = createWhatsAppClient(sessionId);
        sessions.set(sessionId, sessionData);
        
        res.status(201).json({
            success: true,
            sessionId,
            message: 'Session created successfully'
        });
    } catch (error) {
        console.error(`Error creating session ${sessionId}:`, error);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

app.get('/sessions/:sessionId/qr', (req, res) => {
    const { sessionId } = req.params;
    
    if (!sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessions.get(sessionId);
    const qr = sessionData.getQR();
    
    if (!qr) {
        return res.status(404).json({ 
            error: 'QR code not available',
            message: 'QR code not generated yet or session is already authenticated'
        });
    }

    res.json({
        success: true,
        sessionId,
        qrCode: qr,
        message: 'Scan this QR code with your WhatsApp mobile app'
    });
});

app.get('/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    if (!sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessions.get(sessionId);
    const client = sessionData.client;
    
    res.json({
        success: true,
        sessionId,
        status: client.info ? 'ready' : 'connecting',
        hasQR: !!sessionData.getQR()
    });
});

// Add route to send messages
app.post('/sessions/:sessionId/send', async (req, res) => {
    const { sessionId } = req.params;
    const { to, message } = req.body;
    
    if (!sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!to || !message) {
        return res.status(400).json({ error: 'to and message are required' });
    }
    
    try {
        const sessionData = sessions.get(sessionId);
        const client = sessionData.client;
        
        if (!client.info) {
            return res.status(400).json({ 
                error: 'Client not ready', 
                message: 'WhatsApp client is not authenticated yet' 
            });
        }
        
        // Format the number (remove + and add @c.us suffix)
        const formattedNumber = to.replace(/^\+/, '') + '@c.us';
        
        // Send the message
        console.log(`📤 Sending message to ${to} from session ${sessionId}`);
        const result = await client.sendMessage(formattedNumber, message);
        
        res.json({
            success: true,
            sessionId,
            to,
            messageId: result.id._serialized,
            message: 'Message sent successfully'
        });
    } catch (error) {
        console.error(`Error sending message from session ${sessionId}:`, error);
        res.status(500).json({ 
            error: 'Failed to send message',
            details: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Service running on port ${PORT}`);
    console.log(`📱 Endpoints:`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Create Session: POST http://localhost:${PORT}/sessions`);
    console.log(`   Get QR: GET http://localhost:${PORT}/sessions/:sessionId/qr`);
    console.log(`   Get Status: GET http://localhost:${PORT}/sessions/:sessionId`);
});
