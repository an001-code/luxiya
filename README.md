# 构造体卡牌对战 MVP

桌面端优先的双人卡牌对战原型。玩家注册登录、浏览已发布卡牌、构筑并启用合法牌组，再通过六位房间码加入同一房间；服务端保存权威状态并过滤隐藏信息。管理员可以逐张录入完整卡图、规则文本和结构化效果。

## MySQL 初始化

项目使用本机 MySQL 8。复制环境变量模板并填写本地连接信息：

```powershell
cd D:\UnityProject\luxiya
Copy-Item .env.example .env
notepad .env
```

`.env` 已被 Git 忽略。服务启动和数据库命令会自动创建 `MYSQL_DATABASE` 指定的数据库及所需表。

首次初始化：

```powershell
npm.cmd run db:seed-cards -w @pgr/server
npm.cmd run db:bootstrap-admin -w @pgr/server
```

- `db:seed-cards` 幂等导入静态卡表，不覆盖管理员编辑。缺少完整卡图或结构化效果的卡牌保持草稿。
- `db:bootstrap-admin` 使用 `BOOTSTRAP_ADMIN_USERNAME` 和 `BOOTSTRAP_ADMIN_PASSWORD` 创建或更新管理员。密码经 `scrypt` 哈希，明文不会写入数据库或日志。
- 初始化完成后应更换临时管理员密码；生产部署必须使用 HTTPS。

## 本地启动

```powershell
npm.cmd install
npm.cmd run dev
```

- Web：<http://localhost:5173>
- Server：<http://localhost:3001>
- 健康检查：<http://localhost:3001/api/health>

首次打开 Web 先注册或登录。玩家需要在“牌组编辑”中保存并启用一个合法牌组：恰好 50 张、同编号最多 4 张，红蓝黄信号球各 4 张。之后一个玩家创建房间，另一个输入房间码加入，双方点击“使用启用牌组准备”。

管理员使用 `Anonce` 登录后可看到“卡牌录入”。发布卡牌要求完整图片、规则文本、结构化效果配置，以及服务端已注册的复杂效果处理器。

## 验证命令

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

端到端测试默认使用 Windows 已安装的 Microsoft Edge，不需要额外下载 Playwright Chromium。测试从 `.env` 读取管理员账号，使用真实本地 MySQL，并创建带 `E2E-` 前缀的测试卡牌和随机测试账号。

## 工作区

- `packages/protocol`：共享协议与公开类型。
- `packages/cards`：示例卡牌注册表和 50 张开发牌组。
- `packages/game-core`：确定性规则状态机与玩家视图过滤。
- `apps/server`：MySQL 持久化、账号/卡牌/牌组/房间 HTTP API 与 Socket.IO 权威服务。
- `apps/web`：登录、卡库、牌组编辑、管理员录卡和 React 战术指挥台界面。

## 当前规则边界

首版已建模起手调度、阶段推进、费用、属性条件、出场、信号球、攻击、阻挡、响应、攻击充能、伤害充能、侵蚀、牌组更新、结束阶段和认输。卡牌效果同时保存玩家阅读文本与结构化配置；复杂效果通过稳定 `handlerId` 连接规则引擎。协战、浮空和未确认的综合规则不会被静默猜测，相关卡牌保持草稿。

多窗口开发前请先阅读并追加根目录 [`开发记录.md`](./开发记录.md)。

