import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: '**/two-player.spec.ts',
  timeout: 300_000,
  use: { baseURL: 'http://127.0.0.1:5184', headless: true, channel: 'msedge' },
  webServer: [
    { command: 'npm.cmd run dev:e2e -w @pgr/server', url: 'http://127.0.0.1:3011/api/health', timeout: 120_000, reuseExistingServer: false },
    { command: 'npm.cmd run dev:e2e -w @pgr/web', url: 'http://127.0.0.1:5184', timeout: 120_000, reuseExistingServer: false },
  ],
});
