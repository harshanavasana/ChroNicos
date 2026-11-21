import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['coverage/**', 'node_modules/**', 'playwright-report/**', 'test-results/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: 'readonly',
        importScripts: 'readonly',
        ProfileData: 'readonly',
        RequestData: 'readonly',
        ResearchData: 'readonly',
        ResumeData: 'readonly',
        ResumeParser: 'readonly',
        MessageValidation: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-control-regex': 'off'
    }
  }
];
