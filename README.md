# FXTZ-arena

**肥乡天则 (FXTZ-arena)** 是一款 2D 弹幕对战格斗游戏，支持本地人机对战（PvE）以及局域网联机对战（PvP）。

---

## 游戏特性

- **双重对战模式**：支持本地 AI 对战及局域网多人在线联机。
- **弹幕格斗竞技**：融合 2D 格斗与弹幕射击元素。
- **现代化架构**：基于 Monorepo（单体仓库）管理客户端与服务端代码，方便统一开发和构建。

---

## 快速开始

### 开发环境运行

克隆项目到本地后，在根目录下执行以下命令：

```bash
pnpm install
pnpm run dev
```

运行后系统将自动启动客户端和专用服务端：
- **客户端**：访问 `http://localhost:3000`
- **专用服务端**：开放 `0.0.0.0:22334` 端口

---

## 客户端游玩方式

### 1. 网页即玩 (GitHub Pages)
你可以直接访问 [GitHub Pages 页面](https://scarletborder.github.io/FXTZ-arena/) 进行游玩（该版本始终对应最新的 Tag 稳定版）。

### 2. 本地自行构建
前往 Releases 页面下载任意 Tag 版本的资源包并自行部署，具体配置请参阅 [Release.md](Release.md)。

---

## 专用服务端部署

专用服务端目前支持以下两种部署方式：
- **独立 JS 文件运行**（打包后）
- **Docker 镜像部署**

详细的配置与运行指南请参阅 [Release.md](Release.md)。

---

## 项目声明与致谢

- 本项目基于 [Turborepo Kitchen Sink 模板](https://github.com/vercel/turborepo/tree/main/examples/kitchen-sink) 初始化并开发。
