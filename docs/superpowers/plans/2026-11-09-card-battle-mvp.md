# 战双帕弥什卡牌对战网站 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 构建可在本地由两个浏览器通过房间码完成一局全自动裁定对战的桌面端 MVP。

**Architecture:** npm workspace 下拆分 React/Vite Web、Fastify/Socket.IO Server、纯 TypeScript Game Core、Protocol 与 Cards。服务端持有权威状态，客户端仅发送带版本号的命令并渲染过滤后的玩家视图。

**Tech Stack:** Node.js 22、npm 10、TypeScript、React、Vite、Fastify、Socket.IO、Vitest、Playwright。

**Spec:** `docs/design/card-battle-mvp.md`

## Global Constraints

- Web 端口 5173，Server 端口 3001。
- 每方五个战场位、六个信号球展示位、十个费用位。
- 不持久化房间；掉线保留十分钟；首版无计时。
- 所有修改必须追加到根目录 `开发记录.md`。

## Tasks

- [x] Task 1：工程基础、共享协议与开发记录。
- [x] Task 2：确定性规则状态机、隐藏信息与开发牌组。
- [x] Task 3：房间 HTTP/Socket.IO 服务与重连。
- [x] Task 4：战术指挥台 Web 界面与交互。
- [x] Task 5：双浏览器端到端验证、文档与收尾。

