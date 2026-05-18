# 技术架构与网络同步

## 总体架构

游戏由浏览器前端和 Node.js 专用服务器组成。

```text
apps/frontend
  Phaser scene
  input collector
  render adapter
  local/mock transport
  WebTransport client

packages/raid-logic
  deterministic simulation
  tick scheduler
  input queue
  output event queue
  snapshot/rollback/replay
  state hash

packages/types
  shared schemas
  protocol messages
  static content definitions

apps/dedicated-server
  WebTransport server
  room manager
  matchmaking
  readiness/loading coordinator
  input relay
```

## 参考项目

- Rollback Netcode：`D:\code\js\rollback-netcode`。
- Ticker 参考实现：`D:\code\js\mvz443\mvz443\src\game\managers\combat\TickerManager.ts`。
- Phaser + 逻辑组织参考：`D:\code\js\mvz443\mvz443`。

接入时只借鉴架构和必要代码模式，避免复制不适合本项目确定性要求的真实时间逻辑。

## Tick 系统

- 逻辑固定 60fps。
- tick id 使用递增整数。
- 所有冷却、前摇、持续、无敌、冻结、装弹都以 tick 计数。
- 禁止在 `raid-logic` 内读取 `Date.now()`、`performance.now()`、随机源或 Phaser 时钟。
- 渲染可插值，但插值结果不能反向影响逻辑。

## 输入队列与输出队列

### 输入生产者

- 本地玩家键鼠。
- 联机远端玩家输入。
- CPU AI。
- 靶场脚本或空输入。

### 输入消费者

- `raid-logic` 每 tick 消费当前 tick 的两名玩家输入。
- 缺失输入时按 netcode 策略预测或等待。

### 输出生产者

- `raid-logic` 生成状态和事件。

### 输出消费者

- Phaser 渲染层。
- 音效层。
- debug 面板。
- 回放或测试记录器。

## 模式差异

### 联机模式

- 前端通过 WebTransport 连接专用服务器。
- 服务器负责房间状态和输入转发。
- 客户端运行同一份 `raid-logic`。
- 使用 Lockstep + Rollback Netcode。

### 人机对战

- 前端内部运行 mock server。
- mock server 为 CPU 生成输入帧。
- 战局逻辑和联机模式完全一致。

### 靶场

- 前端内部运行 mock server。
- 对手为固定靶子或靶场控制器。
- 无视 cost 上限，允许任意两名角色和无限能力卡。
- 右侧显示训练数据。

## Rollback 设计

每个客户端维护：

- 当前 confirmed frame。
- 当前 predicted frame。
- 本地输入历史。
- 远端输入历史。
- 状态快照环形缓冲。
- 每帧 hash 历史。

流程：

1. 采集本地输入并发送。
2. 若远端输入未到达，使用预测输入继续模拟。
3. 远端真实输入到达后比较预测输入。
4. 若不一致，回滚到该帧前最近快照。
5. 用真实输入重放到当前帧。
6. 重新生成 hash 和输出状态。

快照必须是纯数据结构，不能包含 Phaser 对象、Rapier 原生对象引用或函数闭包。

## WebTransport 协议建议

### 客户端到服务器

- `hello`：用户名、客户端版本、debug 开关。
- `create_room`：房间名、地图、密码、初始命数、cost 上限。
- `join_room`：房间 id、密码。
- `quick_match`。
- `leave_room`。
- `ready`：配装数据。
- `loading_done`。
- `input_frame`：room id、player id、frame、input。
- `ping`。

### 服务器到客户端

- `server_hello`。
- `room_list`。
- `room_created`。
- `room_joined`。
- `room_state`。
- `opponent_ready`。
- `battle_start`：双方配装、地图、起始 frame、随机种子。
- `input_frame`：远端输入。
- `peer_status`：断线、重连、延迟。
- `error`。
- `pong`。

## 房间系统

房间字段：

- id。
- name。
- hasPassword。
- mapId。
- lifeCount。
- costLimit。
- players。
- status：waiting、selecting、loading、fighting、finished。
- createdAtFrame 或服务器时间戳。

快速匹配：

- 从房间列表随机选择一个无密码、未满员、可加入房间。
- 如果没有房间，返回无可用房间，不自动创建，除非后续产品规则改变。

## 确定性要求

- 逻辑状态使用整数、Decimal 或定点数。
- 任何除法、角度、速度换算都集中在数值模块处理。
- 随机数必须使用可复现 PRNG，并由战局种子驱动。
- 状态序列化顺序固定。
- hash 时按确定性字段顺序遍历。
- Map/Set 参与 hash 前必须排序。
- 逻辑层禁止依赖对象创建顺序产生战斗结果。

## Debug Hash

debug 模式开启时：

- 每帧计算战局状态 hash。
- 前端右上角用半透明字体显示最近 10 帧 hash。
- 建议显示格式：`frame: hash8`。
- 联机时可额外标出本地和远端上报 hash 是否一致。

## 物理引擎边界

Rapier 2D 可用于碰撞查询和运动，但必须通过逻辑层封装：

- 输入给 Rapier 的位置、速度和形状参数必须量化。
- 从 Rapier 读取的结果必须转换为确定性逻辑数据。
- 如果 Rapier 在目标平台无法保证确定性，应将关键受击判定改为自研几何检测。

## 测试策略

- 固定输入序列 hash 测试。
- 回滚重放一致性测试。
- 角色技能持续时间测试。
- 碰撞和清弹范围测试。
- 房间协议状态机测试。
- 双客户端模拟延迟测试。
