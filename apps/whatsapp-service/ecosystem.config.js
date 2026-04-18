/**
 * PM2 Ecosystem Configuration for WhatsApp Service
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save
 *   pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'whatsapp-service',
      script: 'dist/index.js',
      cwd: '/opt/leadcrm/apps/whatsapp-service',

      // Process management
      instances: 1, // WhatsApp sessions are not horizontally scalable
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Graceful shutdown (15s to allow session cleanup with multiple sessions)
      kill_timeout: 15000,
      wait_ready: true,
      listen_timeout: 10000,

      // Logging
      error_file: '/var/log/pm2/whatsapp-error.log',
      out_file: '/var/log/pm2/whatsapp-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 3002,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
        // These should be set in the actual environment
        // DATABASE_URL: '...',
        // WHATSAPP_WEBHOOK_SECRET: '...',
        // API_URL: '...',
      },
    },
  ],
};
