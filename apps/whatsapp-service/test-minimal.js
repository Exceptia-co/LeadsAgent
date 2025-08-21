const winston = require('winston');
const path = require('path');
const fs = require('fs');

console.log('🟡 Starting minimal test...');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

console.log('📁 Logs directory created/verified');

// Test winston logger creation
try {
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ]
  });

  logger.info('🟢 Winston logger created successfully');
  console.log('✅ Winston test passed');

} catch (error) {
  console.error('❌ Winston test failed:', error);
}

// Test Express
console.log('🔍 Testing Express...');
try {
  const express = require('express');
  const app = express();
  
  app.get('/test', (req, res) => {
    res.json({ status: 'ok' });
  });

  const server = app.listen(3003, () => {
    console.log('🟢 Express server started on port 3003');
    server.close(() => {
      console.log('✅ Express test passed');
      process.exit(0);
    });
  });

} catch (error) {
  console.error('❌ Express test failed:', error);
  process.exit(1);
}
