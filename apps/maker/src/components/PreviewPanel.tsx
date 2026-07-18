import { useEffect, useRef, useState } from "react";
import { useStage } from "../store";
import { Simulator } from "../sim/Simulator";
import { Button } from "./fields";

type NodeSel = number | "all";

export function PreviewPanel({
  large = false,
  focusNodeIndex,
}: {
  large?: boolean;
  focusNodeIndex?: number | null;
}) {
  const stage = useStage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulator | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<NodeSel>("all");
  const [stats, setStats] = useState({ time: 0, node: 0, mobs: 0, bullets: 0 });

  useEffect(() => {
    if (!stage) return;
    const sim = new Simulator(stage);
    sim.setFocus(selected === "all" ? null : selected);
    simRef.current = sim;
    setPlaying(false);
    drawOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // When the active editor tab is a node, auto-select it in the dropdown.
  useEffect(() => {
    if (typeof focusNodeIndex === "number") setSelected(focusNodeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeIndex]);

  // Apply the selected focus to the simulator.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.setFocus(selected === "all" ? null : selected);
    sim.playing = false;
    setPlaying(false);
    drawOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const sim = simRef.current;
      const canvas = canvasRef.current;
      if (sim && canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          sim.step(dt);
          sim.render(ctx, canvas.width, canvas.height);
          setStats({ time: sim.time, node: sim.nodeIndex, mobs: sim.mobs.length, bullets: sim.bullets.length });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawOnce = () => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (sim && canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) sim.render(ctx, canvas.width, canvas.height);
    }
  };

  const togglePlay = () => {
    const sim = simRef.current;
    if (!sim) return;
    sim.playing = !sim.playing;
    setPlaying(sim.playing);
  };

  const reset = () => {
    const sim = simRef.current;
    if (!sim) return;
    sim.reset();
    sim.playing = false;
    setPlaying(false);
    drawOnce();
  };

  const changeSpeed = (s: number) => {
    const sim = simRef.current;
    if (sim) sim.speed = s;
    setSpeed(s);
  };

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(canvas.width / sim.width, canvas.height / sim.height);
    const ox = (canvas.width - sim.width * scale) / 2;
    const oy = (canvas.height - sim.height * scale) / 2;
    const x = (e.clientX - rect.left - ox) / scale;
    const y = (e.clientY - rect.top - oy) / scale;
    let best: { id: number; d: number } | null = null;
    for (const m of sim.mobs) {
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < 60 && (!best || d < best.d)) best = { id: m.id, d };
    }
    if (best) sim.damageMob(best.id, 200);
  };

  if (!stage) {
    return <div className="preview-empty muted">打开或新建一个关卡以查看预览。</div>;
  }

  return (
    <div className={`preview-panel ${large ? "large" : ""}`}>
      <div className="preview-head">
        <span>实时预览（近似回放）</span>
        <span className="muted small">点击敌人可造成伤害</span>
      </div>
      <div className="preview-focus">
        <span className="muted small">预览范围</span>
        <select
          className="input"
          value={selected === "all" ? "all" : String(selected)}
          onChange={(e) => setSelected(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">全部（整个关卡）</option>
          {stage.nodes.map((node, i) => (
            <option key={node.id} value={i}>
              {i + 1}. {node.kind === "wave" ? "波次" : "商店"} · {node.id}
            </option>
          ))}
        </select>
      </div>
      <canvas
        ref={canvasRef}
        width={large ? 760 : 420}
        height={large ? 456 : 360}
        className={`preview-canvas ${large ? "large" : ""}`}
        onClick={onCanvasClick}
      />
      <div className="preview-controls">
        <Button variant={playing ? "default" : "primary"} onClick={togglePlay}>
          {playing ? "暂停" : "播放"}
        </Button>
        <Button variant="ghost" onClick={reset}>重置</Button>
        <div className="speed-group">
          {[1, 2, 4].map((s) => (
            <button key={s} className={`btn tiny ${speed === s ? "primary" : "ghost"}`} onClick={() => changeSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>
      <div className="preview-stats muted small">
        <span>时间 {stats.time.toFixed(1)}s</span>
        <span>节点 #{stats.node}</span>
        <span>敌人 {stats.mobs}</span>
        <span>弹幕 {stats.bullets}</span>
      </div>
    </div>
  );
}
