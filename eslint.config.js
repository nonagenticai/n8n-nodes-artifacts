// Flat config for ESLint 9+ — applies to nodes/**/*.ts + credentials/**/*.ts
// Generated 2026-05-05 to close the fleet-wide "ESLint couldn't find a config file" gap.

import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'tests/**',
      '__tests__/**',
      'src/generated/**',
      'docs/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['nodes/**/*.ts', 'credentials/**/*.ts'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      // n8n custom-node convention: parameters often use any-typed for n8n's IDataObject input
      '@typescript-eslint/no-explicit-any': 'off',
      // Some modules use `as any` casts for n8n's loose typing surface
      '@typescript-eslint/no-unused-expressions': 'off',
      // Allow underscore-prefix for intentionally unused params
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // n8n descriptors often have unused imports during incremental ops additions
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // Allow `any` in catch blocks (common pattern with n8n's NodeApiError)
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
