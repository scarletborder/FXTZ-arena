# i18n 文案清单

下面是当前已经识别出来、适合迁入 `@repo/i18n` 的主要界面文案和文件位置。  
优先级按“用户可见 + 主流程”排序。

## 首页

- `apps/frontend/src/menu/home-scene.ts`
- 开始战斗、靶场、图鉴、关于、设置
- 页面底部 AI 使用声明
- 语言切换入口图标

## 设置页

- `apps/frontend/src/menu/setting-scene/index.ts`
- 页面标题“设置”
- Tab：联机、通用、关于

- `apps/frontend/src/menu/setting-scene/general-tab.ts`
- 用户名、音乐、音效、调试
- 语言设置入口

- `apps/frontend/src/menu/setting-scene/online-tab.ts`
- 这里包含专用服务器地址、连接状态、连接按钮等文案

- `apps/frontend/src/menu/setting-scene/about-tab.ts`
- 关于页内的说明文本

## 共享弹窗

- `apps/frontend/src/menu/public-server-connectivity-dialog.ts`
- 公共服务器连通性、重新测试、去信任、状态提示

- `apps/frontend/src/menu/language-dialog.ts`
- 语言选择弹窗本身的标题、说明、选项项文本

## 目前仍待继续迁移的界面

- `apps/frontend/src/menu/battle-start-scene.ts`
- `apps/frontend/src/menu/local-lan-scene.ts`
- `apps/frontend/src/menu/loading-scene.ts`
- `apps/frontend/src/menu/result-scene.ts`
- `apps/frontend/src/menu/room-list-scene.ts`
- `apps/frontend/src/menu/room-lobby-scene.ts`
- `apps/frontend/src/menu/select-scene.ts`
- `apps/frontend/src/menu/codex-scene.ts`
- `apps/frontend/src/battle-scene.ts`
