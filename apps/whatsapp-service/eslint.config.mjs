import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'logs/**',
      'sessions/**',
      'coverage/**',
      '*.config.js',
      '*.config.mjs',
      '**/__tests__/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      'src/tests/**'
    ],
  },
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-var-requires': 'warn',
      '@typescript-eslint/consistent-type-imports': 'off', // Too many changes needed
      '@typescript-eslint/no-unnecessary-type-assertion': 'off', // Requires strictNullChecks
      '@typescript-eslint/prefer-nullish-coalescing': 'off', // Requires strictNullChecks
      '@typescript-eslint/prefer-optional-chain': 'warn',

      // Code quality rules - warnings only (won't fail CI)
      'complexity': 'off', // Will address in refactoring
      'max-lines': 'off', // Will address in refactoring
      'max-lines-per-function': 'off', // Will address in refactoring
      'max-params': 'off', // Will address in refactoring
      'max-depth': ['warn', 5],
      'max-nested-callbacks': ['warn', 4],

      // Import rules
      'no-duplicate-imports': 'warn',

      // General JS rules
      'no-console': 'off', // We use console for logging
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'off', // Too many changes needed
      'arrow-spacing': 'off', // Let prettier handle
      'no-trailing-spaces': 'off', // Let prettier handle
      'eol-last': 'off', // Let prettier handle
    },
  },
];
