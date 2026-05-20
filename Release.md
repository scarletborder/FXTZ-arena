# FXTZ Arena Release Artifacts

每个 `v*` tag 会生成四类发布产物：

1. `fxtz-arena-frontend-<version>.zip`：完整前端静态产物，已将 `@repo/raid-logic`、`@repo/types`、`@repo/content`、`@repo/constants` 打入包内。
2. GitHub Pages：同一份前端产物会部署到仓库 Pages 地址。
3. `fxtz-arena-dedicated-server-<version>.tar.gz`：Node 20 目标平台的 dedicated-server bundle，入口为 `dist/index.js`。
4. `fxtz-arena-dedicated-server-image-<version>.tar.gz`：可直接运行的 Docker 镜像归档。

## Frontend Zip

解压后用任意静态文件服务器托管目录内容即可。构建时会把 GitHub Pages base path 写入 Vite，因此 Pages 产物可直接在仓库 Pages 路径下运行。

## GitHub Pages

Release 页面会链接到 GitHub Pages 部署结果。客户端主页右下角和设置页会显示构建版本，格式为：

```text
v1.0.0+23456
```

其中 `v1.0.0` 来自 tag，`23456` 来自commit id。

## Dedicated Server Bundle

解压后在 Node 20+ 环境中运行：

```bash
node dist/index.js
```

可选环境变量：

```bash
HOST=0.0.0.0 PORT=22334 node dist/index.js
```

启动第一行会输出：

```text
You are running FXTZ_area dedicated server.  Version:v1.0.0+23456
```

## Docker Image

加载镜像：

```bash
docker load -i fxtz-arena-dedicated-server-image-v1.0.0+23456.tar.gz
```

运行镜像：

```bash
docker run --rm -p 22334:22334 fxtz-arena-dedicated-server:v1.0.0
```
