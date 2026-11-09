import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.{ts,tsx}', 'apps/**/*.test.{ts,tsx}'],
    testTimeout: 15_000,
    coverage: { reporter: ['text', 'html'] }
  }
});

