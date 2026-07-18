import { makerStore, useStage } from "../../store";
import type {
  WaveNode,
  ShopNode,
  WaveMemberSpec,
  FormationSpec,
  MobClass,
} from "@repo/stage-schema";
import {
  Button,
  Checkbox,
  NumberField,
  Row,
  Section,
  SelectField,
  TextField,
  VecField,
} from "../fields";
import { CLASS_OPTS } from "./parts";
import type { Selection } from "../../editor-types";

const FORMATION_OPTS = [
  { value: "grid", label: "网格 grid" },
  { value: "line", label: "直线 line" },
  { value: "circle", label: "圆 circle" },
  { value: "ring", label: "环 ring" },
] as const;

/** Generates a UUID for member keys (falls back for older runtimes). */
function genKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function NodeEditor({
  index,
  openTab,
}: {
  index: number;
  openTab?: (s: Selection) => void;
}) {
  const stage = useStage();
  if (!stage) return null;
  const node = stage.nodes[index];
  if (!node) return <div className="editor-scroll muted">节点不存在</div>;
  const m = makerStore.mutate;

  const removeNode = () => m((s) => { s.nodes.splice(index, 1); });

  if (node.kind === "shop") {
    const shop = node as ShopNode;
    return (
      <div className="editor-scroll">
        <Section title={`商店节点：${shop.id}`} actions={<Button variant="danger" onClick={removeNode}>删除节点</Button>}>
          <Row label="节点 id"><TextField value={shop.id} onChange={(v) => m((s) => { (s.nodes[index] as ShopNode).id = v; })} /></Row>
          <Row label="X"><NumberField value={shop.x} onChange={(v) => m((s) => { (s.nodes[index] as ShopNode).x = v; })} /></Row>
          <Row label="Y"><NumberField value={shop.y} onChange={(v) => m((s) => { (s.nodes[index] as ShopNode).y = v; })} /></Row>
          <Row label="普通抽取"><NumberField value={shop.rarityPulls.common ?? 0} onChange={(v) => m((s) => { (s.nodes[index] as ShopNode).rarityPulls.common = v; })} /></Row>
          <Row label="稀有抽取"><NumberField value={shop.rarityPulls.rare ?? 0} onChange={(v) => m((s) => { (s.nodes[index] as ShopNode).rarityPulls.rare = v; })} /></Row>
          <Row label="预设">
            <SelectField
              value={shop.presetId ?? ""}
              options={[{ value: "", label: "（无）" }, ...Object.keys(stage.shopPresets ?? {}).map((k) => ({ value: k, label: k }))]}
              onChange={(v) => m((s) => { (s.nodes[index] as ShopNode).presetId = v || undefined; })}
            />
          </Row>
        </Section>
      </div>
    );
  }

  const wave = node as WaveNode;
  const enemyOptions = Object.keys(stage.enemyDefs).map((k) => {
    const d = stage.enemyDefs[k]!;
    return { value: k, label: d.displayName ? `${k}(${d.displayName})` : k };
  });

  const updateMember = (i: number, fn: (mm: WaveMemberSpec) => void) =>
    m((s) => {
      const w = s.nodes[index] as WaveNode;
      const mm = w.members[i];
      if (mm) fn(mm);
    });

  const addMember = () =>
    m((s) => {
      const w = s.nodes[index] as WaveNode;
      w.members.push({ key: genKey(), enemyDefId: Object.keys(s.enemyDefs)[0] ?? "", class: "minion", spawnAtSeconds: 0 });
    });

  return (
    <div className="editor-scroll">
      <Section title={`波次节点：${wave.id}`} actions={<Button variant="danger" onClick={removeNode}>删除节点</Button>}>
        <Row label="节点 id"><TextField value={wave.id} onChange={(v) => m((s) => { (s.nodes[index] as WaveNode).id = v; })} /></Row>
        <Row label="最短间隔秒"><NumberField value={wave.minNextWaveSeconds} onChange={(v) => m((s) => { (s.nodes[index] as WaveNode).minNextWaveSeconds = v; })} /></Row>
        <Row label="最长间隔秒"><NumberField value={wave.maxNextWaveSeconds} onChange={(v) => m((s) => { (s.nodes[index] as WaveNode).maxNextWaveSeconds = v; })} /></Row>
        <div className="sub-block">
          <Checkbox
            checked={wave.maxDurationSeconds !== undefined}
            onChange={(v) => m((s) => { (s.nodes[index] as WaveNode).maxDurationSeconds = v ? (wave.maxDurationSeconds ?? 30) : undefined; })}
            label="设置最长持续时间（超时强制进入下一波）"
          />
          {wave.maxDurationSeconds !== undefined && (
            <>
              <Row label="最长持续秒"><NumberField value={wave.maxDurationSeconds} onChange={(v) => m((s) => { (s.nodes[index] as WaveNode).maxDurationSeconds = v; })} /></Row>
              <Row label="超时清场">
                <Checkbox
                  checked={wave.clearOnTimeout ?? false}
                  onChange={(v) => m((s) => { (s.nodes[index] as WaveNode).clearOnTimeout = v; })}
                  label="清除场上所有怪物与弹幕"
                />
              </Row>
            </>
          )}
        </div>
      </Section>

      <Section title={`成员 (${wave.members.length})`} actions={<Button variant="ghost" onClick={addMember}>+ 添加成员</Button>}>
        {wave.members.length === 0 && <div className="muted small">暂无成员，点击右上角添加。</div>}
        {wave.members.map((member, i) => (
          <div className="member-item" key={member.key + i}>
            <div className="member-head">
              <span>成员 {i + 1}</span>
              <button className="btn ghost tiny" onClick={() => m((s) => { (s.nodes[index] as WaveNode).members.splice(i, 1); })}>✕</button>
            </div>
            <Row label="key">
              <span className="inline-controls">
                <TextField value={member.key} onChange={(v) => updateMember(i, (mm) => { mm.key = v; })} />
                <button
                  className="btn ghost tiny icon"
                  title="随机生成 UUID"
                  onClick={() => updateMember(i, (mm) => { mm.key = genKey(); })}
                >
                  🎲
                </button>
              </span>
            </Row>
            <Row label="敌人定义">
              <span className="inline-controls">
                <SelectField value={member.enemyDefId} options={enemyOptions} onChange={(v) => updateMember(i, (mm) => { mm.enemyDefId = v; })} />
                <button
                  className="btn ghost tiny"
                  title="打开该敌人的编辑标签"
                  disabled={!member.enemyDefId || !stage.enemyDefs[member.enemyDefId]}
                  onClick={() => member.enemyDefId && openTab?.({ kind: "enemy", id: member.enemyDefId })}
                >
                  快捷编辑
                </button>
              </span>
            </Row>
            <Row label="类别">
              <SelectField value={member.class} options={CLASS_OPTS} onChange={(v) => updateMember(i, (mm) => { mm.class = v as MobClass; })} />
            </Row>
            <Row label="延迟秒"><NumberField value={member.spawnAtSeconds ?? 0} onChange={(v) => updateMember(i, (mm) => { mm.spawnAtSeconds = v; })} /></Row>
            <Row label="出生点"><VecField value={member.spawn ?? { x: 600, y: -40 }} onChange={(v) => updateMember(i, (mm) => { mm.spawn = v; })} /></Row>
            <Row label="数量"><NumberField value={member.count ?? 1} onChange={(v) => updateMember(i, (mm) => { mm.count = v > 1 ? v : undefined; })} /></Row>
            <FormationBlock member={member} onChange={(f) => updateMember(i, (mm) => { mm.formation = f; })} />
          </div>
        ))}
      </Section>
    </div>
  );
}

function FormationBlock({
  member,
  onChange,
}: {
  member: WaveMemberSpec;
  onChange: (f: FormationSpec | undefined) => void;
}) {
  const f = member.formation;
  const has = !!f;
  return (
    <div className="sub-block">
      <label className="checkbox">
        <input type="checkbox" checked={has} onChange={(e) => onChange(e.target.checked ? { type: "line" } : undefined)} />
        <span>使用阵型 (count&gt;1)</span>
      </label>
      {f && (
        <>
          <Row label="阵型">
            <SelectField value={f.type} options={FORMATION_OPTS} onChange={(v) => onChange({ ...f, type: v })} />
          </Row>
          <Row label="列数"><NumberField value={f.columns ?? 1} onChange={(v) => onChange({ ...f, columns: v })} /></Row>
          <Row label="间距X"><NumberField value={f.spacingX ?? 48} onChange={(v) => onChange({ ...f, spacingX: v })} /></Row>
          <Row label="间距Y"><NumberField value={f.spacingY ?? 48} onChange={(v) => onChange({ ...f, spacingY: v })} /></Row>
          <Row label="半径"><NumberField value={f.radius ?? 120} onChange={(v) => onChange({ ...f, radius: v })} /></Row>
          <Row label="旋转°"><NumberField value={f.rotationDegrees ?? 0} onChange={(v) => onChange({ ...f, rotationDegrees: v })} /></Row>
        </>
      )}
    </div>
  );
}
