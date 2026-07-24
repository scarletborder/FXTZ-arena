# 资源包离线下载、差量更新与 Service Worker 脱机扩展

本文档分析 FXTZ Arena 当前的 resource-pack 离线分发与差量更新体系，梳理构建脚本 workflow，并给出「Web 端完全脱机运行（无需远端 html/js）」的 Service Worker 扩展方案，最后沉淀为可复用经验。

相关源码：

- `scripts/build-resources.mjs`：构建期资源打包与清单生成。
- `apps/frontend/src/utils/resource-pack.ts`：运行期资源准备、差量下载、离线兜底。
- `apps/frontend/public/resource-cache-sw.js`：资源缓存 Service Worker。
- `apps/frontend/src/utils/assets.ts`：地址抽象层。
- `apps/frontend/src/menu/bootstrap-scene.ts`：启动阶段调用方。
- `.github/workflows/release.yml`：发布 workflow。

---

## 一、整体架构：资源与代码分离

项目把「游戏资源」（图片 / 音频 / JSON）和「应用代码」（html / js / css）拆成两条独立分发链路，这是整套设计的核心前提：

| 类别 | 源目录 | 产物 | 分发方式 | 版本控制 |
|------|--------|------|----------|----------|
| 资源包 resource-pack | `apps/frontend/resources/` | `resource-assets/` + `resource-manifest.json` | 运行时按需下载到本地 | 按文件 sha256 哈希 |
| 应用代码 app-shell | `apps/frontend/src/` | `dist/*.js` / `*.html` | 浏览器随页面加载 / 桌面端打包进安装包 | 整体版本号（git tag） |

设计动机：资源体积大且变更频繁，代码体积小。分离后资源可以脱离二进制 / 页面独立做差量更新。`release.yml` 中的 `mv apps/frontend/dist/resource-assets/*` 就是刻意把资源从桌面二进制里剥离，避免把几百 MB 打进 exe。

---

## 二、离线下载「所有 resource-pack」的机制

### 1. 构建期：生成扁平化产物 + 清单

`scripts/build-resources.mjs` 的职责：

```
resources/ (递归遍历)
  → 复制到 public/resource-assets/（保持相对路径）
  → 对每个文件算 sha256
  → 汇总成 resource-manifest.json
```

清单条目结构（`ResourceManifestEntry`）：

```jsonc
{
  "path": "assets/xxx.png",          // 游戏代码引用的逻辑 key（经 normalizeResourceKey 归一化）
  "outputPath": "resource-assets/xxx.png", // 实际物理 / URL 路径
  "hash": "<sha256>",                // 差量对比的唯一依据
  "size": 12345,
  "mime": "image/png"
}
```

清单顶层含 `version: 2` + `generatedAt` 作为全局版本标记。文件按 `key` 排序，保证清单确定性（利于 CI 缓存和 diff）。

### 2. 运行期：双通道适配

同一份清单驱动两套完全不同的落地方式，在 `BootstrapScene` 启动时通过 `prepareResourcePackSource()` 调用。

**通道 A —— 浏览器端（Cache API + Service Worker）**

1. `caches.open("fxtz-resource-files-v2")` 打开命名缓存。
2. 读本地缓存清单 → 拉远端清单。
3. `collectFilesToDownload` 对比出需下载列表。
4. 逐个 `fetch(..., { cache: "no-cache" })` 下载，`readResponseWithProgress` 流式读取并上报进度，写入 Cache。
5. `deleteStaleEntries` 清理清单里已不存在的旧文件。
6. 注册 `resource-cache-sw.js`，之后游戏内所有 `/resource-assets/` 请求由 SW 走 cache-first。

**通道 B —— 桌面端（Tauri 原生文件系统）**

1. 强制注销残留 SW（避免 localhost 开发缓存干扰）。
2. 用 `@tauri-apps/plugin-http` 的原生 `fetch` **绕过 CORS**（浏览器 fetch 会被 CDN 重定向的跨域拦截）。
3. 资源落地到 `AppLocalData/game_assets/` 物理磁盘。
4. 通过 `convertFileSrc` 把物理路径转成 WebView 安全协议 URL（`asset://`）。
5. 游戏内 `resourceAssetUrl()` 返回本地文件 URL，实现真正脱网读取。

两套通道共用 `applyManifest()` 把清单灌进内存 `resourceEntries` Map；游戏逻辑统一通过 `assetUrl()` → `resourceAssetUrl()` 取地址，对上层完全透明。

### 3. 离线兜底（fallback）

远端清单拉取失败时：只要本地缓存完整（浏览器端 `isManifestCachedComplete` 逐文件校验 / 桌面端有历史清单），就用旧清单进入游戏，进度阶段标记为 `fallback`。这是「断网仍可玩」的核心保障。

---

## 三、差量更新机制

差量的唯一判定函数是 `computeFilesNeedingDownload`（有独立单测覆盖）。对远端清单每个文件，满足以下任一条件则需要下载：

1. 本地清单里没有这个 `path`（新增文件）。
2. `hash` 变了（内容变更）。
3. `outputPath` 变了（改路径）。
4. 清单里有但物理缓存里实际缺失（缓存被清 / 下载中断）。

判定依据是**内容哈希而非时间戳**，因此确定性强、可重复。桌面端还额外做「物理文件 `exists` 校验 + 清单双重比对」，比浏览器端更健壮（防止磁盘文件被外部删除）。

**当前局限**：

- 差量粒度是「文件级」，不是「二进制块级 bsdiff」；单文件即使只改 1 字节也要整文件重下。
- 没有强原子性——下载中途失败会留下部分文件，靠下次 `exists` 检查补齐。桌面端「先写文件、最后写清单」的顺序保证了「清单存在 ⇒ 数据完整」。

---

## 四、构建脚本 Workflow 设计

### 现状（`.github/workflows/release.yml`，tag `v*` 触发）

```
build (ubuntu)
 ├─ build-resources.mjs → dist/resource-assets + manifest
 ├─ vite build → dist（app-shell）
 ├─ upload-pages-artifact(dist) ── deploy-pages（Web 端：资源与代码同域托管在 GitHub Pages）
 └─ 打包 dedicated-server
build-desktop (windows, needs build)
 ├─ build-frontend.mjs (VITE_APP_TARGET=desktop)
 ├─ mv resource-assets 出 dist（剥离，避免打进二进制）
 ├─ tauri-action + resources:["../resource-assets/**"]
 ├─ 生成 latest.json（updater 清单）→ 用 gh-proxy 重写国内加速直链
 └─ portable 便携版
build-docker (needs build)
```

Web 端资源同域随 Pages 部署；桌面端资源既进安装包（首次自带），也能运行时从 CDN（默认 GitHub Pages 地址）差量补齐——即「安装版秒过 / 绿色版首启自动下载」。

### 可复用的 workflow 设计原则

1. **构建产物确定性**：清单按 key 排序 + 内容哈希，保证同样输入产出同样清单，CI 可缓存、可 diff。
2. **资源与代码分阶段构建**：`build:resources` 独立于 `vite build`，互不牵连，可单独触发。
3. **一份清单多目标复用**：browser / desktop / portable 共用同一 `build-resources.mjs` 产物，仅落地方式不同。
4. **版本双轨**：app 用 tag 语义版本（updater），资源用清单 `version` + 文件哈希，互不阻塞。
5. **加速与回源解耦**：`latest.json` 里的直链在 CI 阶段被 gh-proxy 重写，`VITE_CDN_URL` 可覆盖资源回源地址——分发加速是配置项而非硬编码。

### 建议增强（若投入生产）

- 清单加 `manifestHash`（整体指纹），运行时先比一个哈希就能判断「完全无变化」，省去逐文件比对。
- 资源产物加 `?v=<hash>` 或哈希文件名 + 长缓存头，让 CDN / 浏览器 HTTP 缓存也能命中，与应用层缓存互补。
- CI 增量：对比上个 tag 的 manifest，只上传变更文件，减少 Pages 部署体积。

---

## 五、未来 Service Worker 扩展：脱机运行整个游戏

### 当前 SW 的边界

`resource-cache-sw.js` **只拦截 `/resource-assets/` 路径**，其余一切（html、js、css、Phaser chunk）直接放行走网络。

所以现在断网时：资源能读（已缓存），但**页面本身刷新一次就白屏**——因为拿不到 html / js。桌面端不受影响（代码打包在本地），受影响的是 **Web 端**。

### 扩展方案：App-Shell 预缓存（PWA 化）

目标：让 Web 端在完全断网时，刷新 / 重启也能进游戏，无需任何远端 html / js。

**步骤设计**：

1. **构建期生成 app-shell 清单**
   在 `vite build` 后新增脚本（或用 `vite-plugin-pwa`），扫描 `dist` 下所有 `.html` / `.js` / `.css`（含 phaser、rapier 分包），生成 `app-shell-manifest.json`（同样带哈希）。这与现有资源清单机制同构，可直接复用 `computeFilesNeedingDownload` 思路。

2. **SW 升级为双缓存 + 双策略**

   ```
   CACHE_SHELL = "fxtz-app-shell-v<hash>"   // html/js/css
   CACHE_RES   = "fxtz-resource-files-v2"    // 现有资源

   install: 预缓存 app-shell 全部条目（cache.addAll）
   fetch:
     - navigation 请求(mode==="navigate") → 回退到缓存的 index.html（SPA app-shell 模式）
     - .js/.css 命中 shell 缓存 → cache-first
     - /resource-assets/ → 现有逻辑
     - 其余 → network
   activate: 清理旧版本 shell 缓存（按 cache name 前缀）
   ```

3. **版本切换用 cache name 带哈希**
   app-shell 缓存名带构建哈希，新版本 SW `activate` 时删除旧缓存并 `clients.claim()`，实现「后台更新 + 下次启动生效」的标准 PWA 更新语义。现有 SW 已有 `skipWaiting` / `clients.claim` 骨架，直接沿用。

4. **注册时机前移**
   目前 SW 在资源准备阶段才注册。app-shell 缓存应在 `main.ts` 最早注册，确保首屏后台就完成 shell 预缓存，第二次访问即可离线。

5. **加 `manifest.webmanifest` + 安装提示**，让 Web 端可「添加到主屏」变准 PWA。

**关键注意点（踩坑经验）**：

- **base 路径**：`VITE_APP_BASE` 可能是 `./` 或子路径，SW `scope` 和缓存 key 必须用 `baseUrlForPublicAssets()` 统一处理（现有代码已注意到这点）。
- **桌面端必须继续放行**：现有 SW 已对 `tauri:` / `asset:` / `*.localhost` 放行，扩展 shell 缓存时要保持——桌面端不需要 SW 缓存 shell（代码已在本地）。
- **SW 自身更新**：SW 文件本身不能被自己长缓存，否则更新不了；HTTP 层要给 `resource-cache-sw.js` 设 `no-cache`。
- **index.html 不缓存哈希文件名**：html 是入口不能带哈希，要用 network-first 或版本清单驱动更新，避免用户永远卡旧版本。

---

## 六、可复用经验总结

1. **清单驱动一切（Manifest as Single Source of Truth）**：内容哈希清单是差量更新、离线兜底、完整性校验的统一依据。资源和代码都应有各自清单，同构复用对比逻辑。
2. **地址抽象层解耦落地方式**：上层只调 `assetUrl()`，底层是 Cache API 还是 Tauri fs 还是纯网络对业务透明。新增平台只需实现「清单 → 落地 → URL 映射」三步。
3. **哈希而非时间戳做差量**：确定性、可重复、可缓存，是幂等构建与增量部署的基础。
4. **分层缓存 + 优雅降级**：远端优先 → 本地完整则 fallback → 都没有才报错。每层都可独立离线工作。
5. **写入顺序保证一致性**：先写数据文件、最后写清单，让「清单存在」等价于「数据完整」，崩溃恢复时可自愈。
6. **平台差异集中处理**：CORS（桌面用原生 http）、SW 冲突（桌面注销）、路径协议（convertFileSrc）这些平台坑集中在 `prepareResourcePackSource` 一处分支，不污染业务。
7. **资源与代码分离部署**：大资源独立差量、小代码整体版本，互不阻塞——这是能同时支撑「Web 秒开 + 桌面离线 + 便携版自拉取」三形态的根本。
