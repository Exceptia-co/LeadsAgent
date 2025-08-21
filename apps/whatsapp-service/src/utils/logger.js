const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function formatTime() {
  return new Date().toISOString().replace('T', ' ').slice(0, -5);
}

function log(level, message, ...args) {
  const timestamp = formatTime();
  const color = colors[level] || colors.white;
  
  console.log(`${color}[${timestamp}] ${level.toUpperCase()}: ${message}${colors.reset}`, ...args);
}

module.exports = {
  info: (message, ...args) => log('cyan', message, ...args),
  error: (message, ...args) => log('red', message, ...args),
  warn: (message, ...args) => log('yellow', message, ...args),
  success: (message, ...args) => log('green', message, ...args),
  debug: (message, ...args) => {
    if (process.env.DEBUG) {
      log('dim', message, ...args);
    }
  }
};
