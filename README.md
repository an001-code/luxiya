# 构造体卡牌对战 MVP

桌面端优先的本地双人卡牌对战原型。两名玩家通过六位房间码加入同一房间，服务端保存权威状态并过滤隐藏信息。

## 本地启动

```powershell
npm.cmd install
npm.cmd run dev
```

- Web：<http://localhost:5173>
- Server：<http://localhost:3001>
- 健康检查：<http://localhost:3001/api/health>

在两个独立浏览器或无痕窗口打开 Web：一个创建房间，另一个输入房间码加入，双方点击“选择开发牌组并准备”。

## 验证命令

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

端到端测试默认使用 Windows 已安装的 Microsoft Edge，不需要额外下载 Playwright Chromium。

## 工作区

- `packages/protocol`：共享协议与公开类型。
- `packages/cards`：示例卡牌注册表和 50 张开发牌组。
- `packages/game-core`：确定性规则状态机与玩家视图过滤。
- `apps/server`：房间 HTTP API 与 Socket.IO 权威服务。
- `apps/web`：React 战术指挥台界面。

## 当前规则边界

首版已建模起手调度、阶段推进、费用、属性条件、出场、信号球、攻击、阻挡、响应、攻击充能、伤害充能、侵蚀、牌组更新、结束阶段和认输。完整卡表未提供前，复杂卡牌效果通过 `effectIds` 保留扩展接口；协战、浮空和未确认的综合规则不会被静默猜测。

多窗口开发前请先阅读并追加根目录 [`开发记录.md`](./开发记录.md)。

