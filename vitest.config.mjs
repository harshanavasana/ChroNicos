import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['vitest/**/*.test.mjs'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'profile.js',
        'resume-data.js',
        'request-data.js',
        'research-data.js',
        'utils/message-validation.js'
      ],
      exclude: ['tests/**', 'vitest/**']
    }
  }
});
