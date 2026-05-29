# FXTZ Arena 发布文件说明

每个 `v*` 标签都会发布以下文件：

1. **`fxtz-arena-frontend-<version>.zip`**：前端静态文件构建包
2. **GitHub Pages**：部署到仓库 Pages 站点的相同前端构建
3. **`fxtz-arena-dedicated-server-<version>.tar.gz`**：Node 20 专用服务器捆绑包，入口文件为 `dist/index.js`
4. **`fxtz-arena-dedicated-server-image-<version>.tar.gz`**：专用服务器的 Docker 镜像存档

---

## 前端 ZIP 包

解压后使用任意静态文件服务器提供文件服务即可。该构建包含浏览器客户端所需的工作区包。

---

## GitHub Pages

发布页面提供了已部署的 GitHub Pages 构建链接。客户端会在主页/设置界面中显示构建标签，例如：

```text
v1.0.0+23456
```

---

## 专用服务器捆绑包

使用 Node 20+ 运行：

```bash
node dist/index.js
```

不提供证书选项时，服务器以普通 WS/HTTP 模式运行：

```text
Dedicated server listening on ws://0.0.0.0:22334 and ws://[::]:22334
HTTP echo endpoint: http://0.0.0.0:22334/echo
```

可选绑定设置：

```bash
HOST=0.0.0.0 PORT=22334 node dist/index.js
```

### TLS/SSL 配置

#### 方式一：自动生成自签名证书

传入 PEM 目录，让服务器创建并复用本地自签名证书对：

```bash
node dist/index.js --pem-dir=/path/to/pems
```

- 如果 `/path/to/pems/cert.pem` 和 `/path/to/pems/key.pem` 都存在，则直接使用
- 如果都不存在，服务器会运行 OpenSSL 创建它们：

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
```

> 私钥在用户机器上创建，不会包含在发布文件中。

#### 方式二：直接使用现有证书

```bash
node dist/index.js --cert=/path/to/cert.pem --key=/path/to/key.pem
```

> `--cert` 和 `--key` 必须同时提供，不能与 `--pem-dir` 混用。

### TLS 启用后的日志

```text
Dedicated server listening on wss://0.0.0.0:22334 and wss://[::]:22334
HTTP echo endpoint: https://0.0.0.0:22334/echo
```

### 自签名证书使用说明

1. 在浏览器中打开 echo 端点：
   ```
   https://<服务器地址>:22334/echo
   ```
2. 接受/信任证书警告
3. 在游戏中使用对应的 WebSocket 地址：
   ```
   wss://<服务器地址>:22334/
   ```

---

## Docker 镜像

加载镜像：

```bash
docker load -i fxtz-arena-dedicated-server-image-v1.0.0+23456.tar.gz
```

运行镜像：

```bash
docker run --rm -p 22334:22334 fxtz-arena-dedicated-server:v1.0.0
```