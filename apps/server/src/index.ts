import { buildServer } from './server.js';
import { createSeededRng, RoomManager } from './room-manager.js';
import { connectMySqlRepository, mysqlConfigFromEnv } from './persistence/mysql-repository.js';
import { loadProjectEnv } from './env.js';
import type { AppRepository } from './persistence/types.js';

let repository: AppRepository | undefined;
try {
  loadProjectEnv();
  console.log('[启动] 正在连接 MySQL 并检查数据库结构…');
  repository = await connectMySqlRepository(mysqlConfigFromEnv());
  console.log('[启动] 数据库就绪，正在启动登录与对局接口…');
  const manager = process.env.GAME_RNG_SEED ? new RoomManager({ rng: createSeededRng(process.env.GAME_RNG_SEED) }) : undefined;
  const server = buildServer({ repository, ...(manager ? { manager } : {}) });
  const port = Number(process.env.PORT ?? 3001);
  await server.listen({ port, host: '0.0.0.0' });
  console.log(`Card battle server listening on http://localhost:${port}`);
} catch (error) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'UNKNOWN';
  const hints: Record<string, string> = {
    ECONNREFUSED: '无法连接 MySQL，请确认数据库服务已启动且 .env 中的地址和端口正确',
    ETIMEDOUT: 'MySQL 连接超时，请检查数据库地址和网络连接',
    ER_ACCESS_DENIED_ERROR: 'MySQL 拒绝连接，请检查 .env 中的数据库账号与密码',
    EADDRINUSE: '后端端口已被占用，请先停止之前启动的本项目服务',
  };
  console.error(`[启动失败] ${hints[code] ?? '服务初始化失败，请检查数据库配置和本地运行环境'}（${code}）。`);
  if (repository) await repository.close();
  process.exitCode = 1;
}
