import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: '**/two-player.spec.ts',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:5174', headless: true, channel: 'msedge' },
  webServer: [
    { command: 'npm.cmd run dev -w @pgr/server', port: 3001, reuseExistingServer: true },
    { command: 'npm.cmd run dev:e2e -w @pgr/web', port: 5174, reuseExistingServer: true },
  ],
});
