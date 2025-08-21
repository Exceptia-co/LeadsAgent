const express = require('express');
const { Client, LocalAuth, MessageMedia, Location } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3003; // Usamos puerto diferente para no conflictar

// Middleware
app.use(express.json());

// Global sessions store
const sessions = new Map();

// Ensure sessions directory exists
const sessionsDir = './sessions';
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

console.log('🚀 Starting WhatsApp Multimedia Service...');

// Helper to create WhatsApp client
function createWhatsAppClient(sessionId) {
    console.log(`Creating WhatsApp client for session: ${sessionId}`);
    
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: sessionId,
            dataPath: './sessions'
        }),
        puppeteer: {
            headless: false,
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

// Get service capabilities
app.get('/capabilities', (req, res) => {
    res.json({
        success: true,
        capabilities: {
            text: "Send text messages",
            media: "Send images, videos, documents",
            audio: "Send audio files and voice messages",
            location: "Send GPS coordinates",
            contact: "Send contact cards"
        },
        endpoints: [
            "POST /sessions - Create session",
            "GET /sessions/:id - Get session status",
            "GET /sessions/:id/qr - Get QR code",
            "POST /sessions/:id/send - Send text message",
            "POST /sessions/:id/send-media - Send media files",
            "POST /sessions/:id/send-location - Send location",
            "POST /sessions/:id/send-voice - Send voice message"
        ]
    });
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

// Send text messages
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
        
        const formattedNumber = to.replace(/^\+/, '') + '@c.us';
        
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

// Send media files
app.post('/sessions/:sessionId/send-media', async (req, res) => {
    const { sessionId } = req.params;
    const { to, mediaPath, caption } = req.body;
    
    if (!sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!to || !mediaPath) {
        return res.status(400).json({ error: 'to and mediaPath are required' });
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
        
        const formattedNumber = to.replace(/^\+/, '') + '@c.us';
        
        let media;
        if (mediaPath.startsWith('http')) {
            media = await MessageMedia.fromUrl(mediaPath);
        } else {
            if (!fs.existsSync(mediaPath)) {
                return res.status(400).json({ error: 'Media file not found' });
            }
            media = MessageMedia.fromFilePath(mediaPath);
        }
        
        console.log(`📷 Sending media to ${to} from session ${sessionId}`);
        const result = await client.sendMessage(formattedNumber, media, {
            caption: caption || undefined
        });
        
        res.json({
            success: true,
            sessionId,
            to,
            messageId: result.id._serialized,
            message: 'Media sent successfully'
        });
        
    } catch (error) {
        console.error(`Error sending media from session ${sessionId}:`, error);
        res.status(500).json({ 
            error: 'Failed to send media',
            details: error.message
        });
    }
});

// Send location
app.post('/sessions/:sessionId/send-location', async (req, res) => {
    const { sessionId } = req.params;
    const { to, latitude, longitude, description } = req.body;
    
    if (!sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!to || !latitude || !longitude) {
        return res.status(400).json({ error: 'to, latitude, and longitude are required' });
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
        
        const formattedNumber = to.replace(/^\+/, '') + '@c.us';
        const location = new Location(parseFloat(latitude), parseFloat(longitude), description || '');
        
        console.log(`📍 Sending location to ${to} from session ${sessionId}`);
        const result = await client.sendMessage(formattedNumber, location);
        
        res.json({
            success: true,
            sessionId,
            to,
            messageId: result.id._serialized,
            message: 'Location sent successfully'
        });
        
    } catch (error) {
        console.error(`Error sending location from session ${sessionId}:`, error);
        res.status(500).json({ 
            error: 'Failed to send location',
            details: error.message
        });
    }
});

// Send voice message
app.post('/sessions/:sessionId/send-voice', async (req, res) => {
    const { sessionId } = req.params;
    const { to, audioPath } = req.body;
    
    if (!sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!to || !audioPath) {
        return res.status(400).json({ error: 'to and audioPath are required' });
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
        
        const formattedNumber = to.replace(/^\+/, '') + '@c.us';
        
        if (!fs.existsSync(audioPath)) {
            return res.status(400).json({ error: 'Audio file not found' });
        }
        
        const audio = MessageMedia.fromFilePath(audioPath);
        
        console.log(`🎤 Sending voice message to ${to} from session ${sessionId}`);
        const result = await client.sendMessage(formattedNumber, audio, { sendAudioAsVoice: true });
        
        res.json({
            success: true,
            sessionId,
            to,
            messageId: result.id._serialized,
            message: 'Voice message sent successfully'
        });
        
    } catch (error) {
        console.error(`Error sending voice message from session ${sessionId}:`, error);
        res.status(500).json({ 
            error: 'Failed to send voice message',
            details: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Multimedia Service running on port ${PORT}`);
    console.log(`📱 Enhanced Endpoints:`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Capabilities: http://localhost:${PORT}/capabilities`);
    console.log(`   Create Session: POST http://localhost:${PORT}/sessions`);
    console.log(`   Get QR: GET http://localhost:${PORT}/sessions/:sessionId/qr`);
    console.log(`   Get Status: GET http://localhost:${PORT}/sessions/:sessionId`);
    console.log(`   Send Text: POST http://localhost:${PORT}/sessions/:sessionId/send`);
    console.log(`   Send Media: POST http://localhost:${PORT}/sessions/:sessionId/send-media`);
    console.log(`   Send Location: POST http://localhost:${PORT}/sessions/:sessionId/send-location`);
    console.log(`   Send Voice: POST http://localhost:${PORT}/sessions/:sessionId/send-voice`);
});
