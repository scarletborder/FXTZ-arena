import { makerStore, useStage } from "../../store";
import type { StageMode, WaveNode, ShopNode } from "@repo/stage-schema";
import { Button, Checkbox, NumberField, Row, Section, TextField } from "../fields";
import { defaultBulletParams } from "./parts";
import type { Selection } from "../../editor-types";

export function StageOverview({ onSelect }: { onSelect: (s: Selection) => void }) {
  const stage = useStage();
  if (!stage) return null;
  const m = makerStore.mutate;

  const toggleMode = (mode: StageMode) => {
    m((s) => {
      const has = s.compatibleModes.includes(mode);
      s.compatibleModes = has ? s.compatibleModes.filter((x) => x !== mode) : [...s.compatibleModes, mode];
    });
  };

  const addWave = () => {
    const id = `wave-${stage.nodes.length + 1}`;
    const node: WaveNode = { kind: "wave", id, minNextWaveSeconds: 8, maxNextWaveSeconds: 18, members: [] };
    m((s) => { s.nodes.push(node); });
    onSelect({ kind: "node", index: s_index(stage, id) });
  };

  const addShop = () => {
    const id = `shop-${stage.nodes.length + 1}`;
    const node: ShopNode = { kind: "shop", id, x: stage.arena.width / 2, y: stage.arena.height / 2, rarityPulls: { common: 4, rare: 1 } };
    m((s) => { s.nodes.push(node); });
    onSelect({ kind: "node", index: s_index(stage, id) });
  };

  const addEnemy = () => {
    const id = `enemy-${Object.keys(stage.enemyDefs).length + 1}`;
    m((s) => {
      s.enemyDefs[id] = {
        id,
        class: "minion",
        maxHealth: 100,
        hitRadius: 28,
        spawn: { x: stage.arena.width / 2, y: -40 },
        rewards: { point: "small" },
      };
    });
    onSelect({ kind: "enemy", id });
  };

  const addBulletPreset = () => {
    const id = `bullet-${Object.keys(stage.bulletPresets ?? {}).length + 1}`;
    m((s) => {
      (s.bulletPresets ??= {})[id] = { id, bullet: defaultBulletParams() };
    });
    onSelect({ kind: "bullet", id });
  };

  const addShopPreset = () => {
    const id = `shop-${Object.keys(stage.shopPresets ?? {}).length + 1}`;
    m((s) => {
      (s.shopPresets ??= {})[id] = { id, rarityPulls: { common: 4, rare: 1 } };
    });
    onSelect({ kind: "shop", id });
  };

  return (
    <div className="editor-scroll">
      <Section title="关卡信息">
        <Row label="名称"><TextField value={stage.name} onChange={(v) => m((s) => { s.name = v; })} /></Row>
        <Row label="描述"><TextField value={stage.description ?? ""} onChange={(v) => m((s) => { s.description = v; })} /></Row>
        <Row label="作者"><TextField value={stage.author ?? ""} onChange={(v) => m((s) => { s.author = v; })} /></Row>
      </Section>

      <Section title="竞技场">
        <Row label="宽度"><NumberField value={stage.arena.width} step={40} onChange={(v) => m((s) => { s.arena = { ...s.arena, width: v }; })} /></Row>
        <Row label="高度"><NumberField value={stage.arena.height} step={40} onChange={(v) => m((s) => { s.arena = { ...s.arena, height: v }; })} /></Row>
      </Section>

      <Section title="兼容模式">
        <Checkbox checked={stage.compatibleModes.includes("versus")} onChange={() => toggleMode("versus")} label="对战模式 (versus)" />
        <Checkbox checked={stage.compatibleModes.includes("collaborate")} onChange={() => toggleMode("collaborate")} label="合作模式 (collaborate)" />
        <Checkbox checked={stage.settings?.loopNodes ?? false} onChange={(v) => m((s) => { s.settings = { ...s.settings, loopNodes: v }; })} label="循环节点（无尽）" />
      </Section>

      <Section title="快速统计">
        <div className="stat-grid">
          <div><b>{stage.nodes.length}</b><span>节点</span></div>
          <div><b>{stage.nodes.filter((n) => n.kind === "wave").length}</b><span>波次</span></div>
          <div><b>{stage.nodes.filter((n) => n.kind === "shop").length}</b><span>商店</span></div>
          <div><b>{Object.keys(stage.enemyDefs).length}</b><span>敌人</span></div>
          <div><b>{Object.keys(stage.bulletPresets ?? {}).length}</b><span>弹幕预设</span></div>
          <div><b>{Object.keys(stage.shopPresets ?? {}).length}</b><span>商店预设</span></div>
        </div>
      </Section>

      <Section title="添加内容" actions={<></>}>
        <div className="btn-row">
          <Button variant="primary" onClick={addWave}>＋ 波次节点</Button>
          <Button onClick={addShop}>＋ 商店节点</Button>
          <Button onClick={addEnemy}>＋ 敌人定义</Button>
          <Button onClick={addBulletPreset}>＋ 弹幕预设</Button>
          <Button onClick={addShopPreset}>＋ 商店预设</Button>
        </div>
      </Section>
    </div>
  );
}

function s_index(stage: { nodes: { id: string }[] }, id: string): number {
  return stage.nodes.findIndex((n) => n.id === id);
}
