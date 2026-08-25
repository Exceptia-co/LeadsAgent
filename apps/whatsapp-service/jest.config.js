module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
    // @whiskeysockets/baileys ships pure ESM ("type": "module", no CJS
    // build). Jest's default transformIgnorePatterns never transforms
    // node_modules, so its `import` syntax fails to parse when required
    // from CommonJS specs. This carve-out transpiles just that package's
    // own .js files -- every other .js in the tree (jest.setup.js, other
    // deps) is untouched, same as before.
    '@whiskeysockets/baileys/.*\\.js$': 'ts-jest',
  },
  transformIgnorePatterns: ['node_modules/(?!.*@whiskeysockets/baileys)'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts', '!src/types/**/*'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  extensionsToTreatAsEsm: [],
  // Pragmatic: los specs son unitarios mockeados, pero el singleton
  // DatabaseService abre Pool en su constructor y ese handle leak hace
  // que Jest fuerce el cierre con warning. Revisitar (globalTeardown)
  // cuando se introduzcan tests de integración con Redis/Prisma reales.
  forceExit: true,
};
