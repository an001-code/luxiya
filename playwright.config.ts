import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true, channel: 'msedge' },
  webServer: [
    { command: 'npm.cmd run dev -w @pgr/server', port: 3001, reuseExistingServer: true },
    { command: 'npm.cmd run dev -w @pgr/web', port: 5173, reuseExistingServer: true },
  ],
});
