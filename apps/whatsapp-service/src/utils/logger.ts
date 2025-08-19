enum Colors {
  RESET = '\x1b[0m',
  BRIGHT = '\x1b[1m',
  DIM = '\x1b[2m',
  RED = '\x1b[31m',
  GREEN = '\x1b[32m',
  YELLOW = '\x1b[33m',
  BLUE = '\x1b[34m',
  MAGENTA = '\x1b[35m',
  CYAN = '\x1b[36m',
  WHITE = '\x1b[37m'
}

function formatTime(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, -5);
}

function log(level: string, message: string, ...args: any[]): void {
  const timestamp = formatTime();
  const color = Colors[level.toUpperCase() as keyof typeof Colors] || Colors.WHITE;
  
  console.log(`${color}[${timestamp}] ${level.toUpperCase()}: ${message}${Colors.RESET}`, ...args);
}

export const logger = {
  info: (message: string, ...args: any[]) => log('cyan', message, ...args),
  error: (message: string, ...args: any[]) => log('red', message, ...args),
  warn: (message: string, ...args: any[]) => log('yellow', message, ...args),
  success: (message: string, ...args: any[]) => log('green', message, ...args),
  debug: (message: string, ...args: any[]) => {
    if (process.env.DEBUG) {
      log('dim', message, ...args);
    }
  }
};
