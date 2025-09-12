// jest.setup.js
// Global test setup

// Mock console to reduce noise in tests unless explicitly needed
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};
