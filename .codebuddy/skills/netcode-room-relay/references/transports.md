# WS / WebTransport 传输实现细节

真实实现参考：`apps/frontend/src/network/transport/`、`apps/dedicated-server/src/transport/`。

## 1. 客户端传输抽象

```ts
// transport/base.ts
interface NetworkTransport {
  open(): void;
  send(data: ArrayBuffer | Uint8Array): void;
  close(): void;
  onOpen?: () => void;
  onClose?: (ev: { code?: number; reason?: string }) => void;
  onError?: (err: unknown) => void;
  onMessage?: (data: ArrayBuffer) => void;
}
```

选择逻辑（client.ts:184 附近）：

```ts
useWebTransport
  ? (IS_DESKTOP_APP ? new WtDesktopTransport(addr) : new WtNetworkTransport(addr, fingerprint))
  : new WsNetworkTransport(addr)
```

## 2. 地址规整（address.ts）

- 空串 → `ws://localhost:22334`（DEFAULT_WS_PORT=22334）；
- `https://host` → WebTransport，强制改写 pathname 为 `/wt` 并补端口；
- `ws(s)://` 或裸主机/IPv6 → WS，补默认端口；
- `isWebTransportAddress()` 以 `https://` 前缀判定。

## 3. WebSocket

服务端（ws-server.ts）：
```ts
const server = tls ? https.createServer({cert, key}, handleHttpRequest)
                   : http.createServer(handleHttpRequest);
const wss = new WebSocketServer({ server });
wss.on("connection", (socket) => { /* 包装成 Connection */ });
```

客户端（ws.ts:16）：
```ts
const socket = new WebSocket(this.address);
socket.binaryType = "arraybuffer";   // 必须，否则默认 Blob
socket.onmessage = (ev) => this.onMessage?.(ev.data);
```

## 4. WebTransport

### 服务端（wt-server.ts，@fails-components/webtransport）

```ts
const { Http3Server } = await import("@fails-components/webtransport");
const server = new Http3Server({
  host, port,
  cert: certPem, privKey: keyPem,
  secret: randomBytes(32).toString("hex"),
  defaultDatagramsReadableMode: "bytes",
});
server.startServer();
const sessions = server.sessionStream("/wt");   // 只接受 /wt 路径
// 对每个 session：等 incomingBidirectionalStreams 的第一条流作消息通道
```

### 客户端（wt.ts）

```ts
const options = fingerprint ? {
  serverCertificateHashes: [{ algorithm: "sha-256", value: hexToArrayBuffer(fingerprint) }],
} : undefined;
const transport = new WebTransport(url, options);   // url = https://host:port/wt
await transport.ready;
const stream = await transport.createBidirectionalStream();
const writer = stream.writable.getWriter();
// readLoop: for await chunk of stream.readable → 组帧 → onMessage
```

### 证书指纹自动回退（client.ts:166-196）

1. 首连不带指纹 → 浏览器因证书不可信立即失败；
2. `onError` 捕获后 fetch `https://host/fingerprint` 取 SHA-256 十六进制串；
3. `certificateFingerprintToArrayBuffer`（fingerprint.ts:20）转 ArrayBuffer，用新 options 重连一次（只重试一次防死循环）；
4. 已知公共服务器可预置指纹表（PUBLIC_SERVER 列表）跳过步骤 1-2。

约束：`serverCertificateHashes` 要求证书为 ECDSA 且有效期 ≤14 天 → 服务器需自动轮换自签证书并保证 /fingerprint 实时反映当前证书。

### 字节流分帧

QUIC 流没有消息边界。readLoop 收到的 chunk 可能拆分/合并，必须做长度前缀组帧：

```
[u32 大端: 载荷长度][载荷...]
```

维护接收缓冲，凑齐一条完整消息才回调 onMessage。

## 5. 桌面端 WT 桥接（wt-desktop.ts）

浏览器 WebTransport API 在 WebView 中不可用时，委托原生层（Rust/Tauri）：

```ts
invoke("wt_connect", { addr })            // 建连
invoke("wt_send", { data })              // 发送
invoke("wt_close")                        // 关闭
listen("wt-open" | "wt-error" | "wt-close" | "wt-receive", handler)  // 事件回传
```

原生侧用 QUIC 库（如 quinn/wtransport）实现同样的 /wt 会话 + 双向流协议；对上层暴露与浏览器版完全相同的 NetworkTransport 接口。

## 6. 心跳

客户端定期发 CLIENT_PING（二进制码 3），服务器回 SERVER_PONG（19）：
- 测 RTT 展示给玩家；
- 保活 NAT/代理映射；
- 连续多个 pong 超时 → 主动判连接死亡并走重连流程（TCP 半开连接可能长时间不报错）。
