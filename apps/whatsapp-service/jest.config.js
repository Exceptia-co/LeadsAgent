module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts', '!src/types/**/*'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  extensionsToTreatAsEsm: [],
  globals: {
    'ts-jest': {
      useESM: false,
    },
  },
  // Pragmatic: los specs son unitarios mockeados, pero el singleton
  // DatabaseService abre Pool en su constructor y ese handle leak hace
  // que Jest fuerce el cierre con warning. Revisitar (globalTeardown)
  // cuando se introduzcan tests de integración con Redis/Prisma reales.
  forceExit: true,
};
