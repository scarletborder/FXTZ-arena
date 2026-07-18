import type {
  BulletParams,
  PathSpec,
  MovementSpec,
  MovementPhase,
  FirePattern,
  FireSpec,
  FormRule,
  SpellPhase,
  RewardSize,
  RewardConfig,
  RewardDrop,
  RewardItemType,
  BulletKind,
  SpeedRank,
  EaseKind,
  TargetRef,
  LaserPattern,
  BulletPattern,
} from "@repo/stage-schema";
import {
  ColorField,
  NumberField,
  Row,
  Section,
  SelectField,
  TextField,
  VecField,
  Checkbox,
  Button,
  ListEditor,
} from "../fields";

// ───────────────────────── helpers ─────────────────────────

export function numToHex(n: number): string {
  return "#" + (n & 0xffffff).toString(16).padStart(6, "0");
}
export function hexToNum(s: string): number {
  const v = parseInt(s.replace("#", ""), 16);
  return Number.isFinite(v) ? v : 0;
}

// ───────────────────────── option lists ─────────────────────────

export const CLASS_OPTS = [
  { value: "minion", label: "杂兵 minion" },
  { value: "elite", label: "精英 elite" },
  { value: "boss", label: "Boss boss" },
] as const;

export const REWARD_OPTS = [
  { value: "none", label: "无" },
  { value: "small", label: "小" },
  { value: "medium", label: "中" },
  { value: "large", label: "大" },
] as const;

export const REWARD_TYPE_OPTS = [
  { value: "point", label: "point" },
  { value: "money", label: "money" },
  { value: "power", label: "power" },
] as const;

export const REWARD_SIZE_OPTS = [
  { value: "small", label: "small" },
  { value: "medium", label: "medium" },
  { value: "large", label: "large" },
] as const;

export const SPEED_OPTS = [
  { value: "low", label: "慢 low" },
  { value: "medium", label: "中 medium" },
  { value: "high", label: "快 high" },
] as const;

export const BULLET_KIND_OPTS = [
  { value: "orb", label: "圆 orb" },
  { value: "knife", label: "刃 knife" },
  { value: "diamond", label: "菱 diamond" },
  { value: "spark", label: "星 spark" },
] as const;

export const EASE_OPTS = [
  { value: "linear", label: "线性" },
  { value: "easeIn", label: "缓入" },
  { value: "easeOut", label: "缓出" },
  { value: "easeInOut", label: "缓入出" },
  { value: "easeInOutSine", label: "正弦" },
] as const;

export const PATH_KIND_OPTS = [
  { value: "point", label: "定点" },
  { value: "line", label: "直线" },
  { value: "bezier", label: "贝塞尔" },
  { value: "circle", label: "圆周" },
  { value: "follow", label: "追踪" },
  { value: "drift", label: "匀速漂移" },
] as const;

export const PATTERN_TYPE_OPTS = [
  { value: "ring", label: "环形 ring" },
  { value: "spread", label: "扇形 spread" },
  { value: "spiral", label: "螺旋 spiral" },
  { value: "aimed", label: "自机狙 aimed" },
  { value: "custom", label: "自定义 custom" },
  { value: "laser", label: "激光 laser" },
] as const;

export const TARGET_OPTS = [
  { value: "player", label: "玩家" },
  { value: "target", label: "目标" },
  { value: "both", label: "两者" },
  { value: "self", label: "自身" },
] as const;

export const FORM_WHEN_OPTS = [
  { value: "healthBelow", label: "血量低于" },
  { value: "healthAbove", label: "血量高于" },
  { value: "ageAbove", label: "存活超过" },
  { value: "always", label: "总是" },
] as const;

export const MOVEMENT_TYPE_OPTS = [
  { value: "static", label: "固定点" },
  { value: "phases", label: "分阶段" },
  { value: "single", label: "单阶段" },
] as const;

export const SPELL_PHASE_KIND_OPTS = [
  { value: "nonspell", label: "非符 nonspell" },
  { value: "spell", label: "符卡 spell" },
] as const;

// ───────────────────────── small selects ─────────────────────────

export function RewardSelect({
  value,
  onChange,
}: {
  value?: RewardSize;
  onChange: (v?: RewardSize) => void;
}) {
  return (
    <SelectField
      value={(value ?? "none") as "none" | RewardSize}
      options={REWARD_OPTS}
      onChange={(v) => onChange(v === "none" ? undefined : (v as RewardSize))}
    />
  );
}

/** Normalizes a reward config into a flat drop list, migrating legacy sizes. */
export function rewardConfigToDrops(rewards: RewardConfig | undefined): RewardDrop[] {
  if (rewards?.drops) return rewards.drops;
  const out: RewardDrop[] = [];
  if (rewards?.point) out.push({ type: "point", size: rewards.point, count: 1 });
  if (rewards?.money) out.push({ type: "money", size: rewards.money, count: 1 });
  if (rewards?.power) out.push({ type: "power", size: rewards.power, count: 1 });
  return out;
}

/**
 * Editor for a mob's drops. Starts empty; the user adds one entry per
 * (item type × size) with a quantity. Writing always uses the `drops` model
 * (legacy single-size shorthands are migrated away on first edit).
 */
export function RewardDropsEditor({
  value,
  onChange,
}: {
  value: RewardConfig | undefined;
  onChange: (v: RewardConfig) => void;
}) {
  const drops = rewardConfigToDrops(value);
  const setDrops = (next: RewardDrop[]) => onChange({ drops: next });
  const update = (i: number, patch: Partial<RewardDrop>) =>
    setDrops(drops.map((d, k) => (k === i ? { ...d, ...patch } : d)));

  return (
    <>
      {drops.length === 0 && <div className="muted small">暂无掉落物，点击下方按钮添加。</div>}
      {drops.map((d, i) => (
        <div className="reward-drop-row" key={i}>
          <SelectField
            value={d.type}
            options={REWARD_TYPE_OPTS}
            onChange={(v) => update(i, { type: v as RewardItemType })}
          />
          <SelectField
            value={d.size}
            options={REWARD_SIZE_OPTS}
            onChange={(v) => update(i, { size: v as RewardSize })}
          />
          <NumberField value={d.count} min={1} onChange={(v) => update(i, { count: Math.max(1, Math.round(v)) })} />
          <button className="btn ghost tiny" title="删除" onClick={() => setDrops(drops.filter((_, k) => k !== i))}>
            ✕
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => setDrops([...drops, { type: "point", size: "small", count: 1 }])}>
        ＋ 添加新掉落物
      </Button>
    </>
  );
}

// ───────────────────────── factories ─────────────────────────

export function defaultBulletParams(): BulletParams {
  return { kind: "orb", speedRank: "medium", width: 12, height: 12, color: "#ffd166" };
}
export function defaultPath(): PathSpec {
  return { kind: "point", x: 0, y: 0 };
}
export function defaultPhase(): MovementPhase {
  return { startSeconds: 0, durationSeconds: 3, path: { kind: "point", x: 1200, y: 800 } };
}
export function defaultPattern(): FirePattern {
  return { type: "ring", count: 12, startAngleDegrees: 0, bullet: defaultBulletParams() };
}
export function defaultFireSpec(): FireSpec {
  return { startSeconds: 0, intervalSeconds: 1, pattern: defaultPattern() };
}
export function defaultFormRule(): FormRule {
  return { when: "healthBelow", threshold: 0.5, form: "phase2" };
}
export function defaultSpellPhase(): SpellPhase {
  return { kind: "spell", name: "符卡阶段", maxHealth: 2000, durationSeconds: 30, fire: [defaultFireSpec()] };
}

// ───────────────────────── bullet params ─────────────────────────

export function BulletParamsEditor({
  value,
  onChange,
}: {
  value: BulletParams;
  onChange: (v: BulletParams) => void;
}) {
  return (
    <>
      <Row label="类型">
        <SelectField value={value.kind} options={BULLET_KIND_OPTS} onChange={(v) => onChange({ ...value, kind: v })} />
      </Row>
      <Row label="贴图 key">
        <TextField value={value.textureKey ?? ""} onChange={(v) => onChange({ ...value, textureKey: v || undefined })} />
      </Row>
      <Row label="速度档">
        <SelectField value={value.speedRank} options={SPEED_OPTS} onChange={(v) => onChange({ ...value, speedRank: v })} />
      </Row>
      <Row label="宽">
        <NumberField value={value.width} onChange={(v) => onChange({ ...value, width: v })} />
      </Row>
      <Row label="高">
        <NumberField value={value.height} onChange={(v) => onChange({ ...value, height: v })} />
      </Row>
      <Row label="伤害">
        <NumberField value={value.damage ?? 1} onChange={(v) => onChange({ ...value, damage: v })} />
      </Row>
      <Row label="追踪帧">
        <NumberField value={value.homingTicks ?? 0} onChange={(v) => onChange({ ...value, homingTicks: v || undefined })} />
      </Row>
      <Row label="存活帧">
        <NumberField value={value.expireTicks ?? 0} onChange={(v) => onChange({ ...value, expireTicks: v || undefined })} />
      </Row>
      <Row label="偏移">
        <NumberField value={value.spawnOffset ?? 0} onChange={(v) => onChange({ ...value, spawnOffset: v || undefined })} />
      </Row>
      <Row label="速度px/s">
        <NumberField value={value.speedPxPerSec ?? 0} onChange={(v) => onChange({ ...value, speedPxPerSec: v || undefined })} />
      </Row>
      <Row label="颜色">
        <ColorField value={value.color ?? "#ffd166"} onChange={(v) => onChange({ ...value, color: v })} />
      </Row>
    </>
  );
}

// ───────────────────────── path ─────────────────────────

export function PathEditor({
  value,
  onChange,
}: {
  value: PathSpec;
  onChange: (v: PathSpec) => void;
}) {
  const changeKind = (kind: PathSpec["kind"]) => {
    switch (kind) {
      case "point":
        onChange({ kind: "point", x: 1200, y: 800 });
        break;
      case "line":
        onChange({ kind: "line", from: { x: 1200, y: -80 }, to: { x: 1200, y: 1000 }, ease: "easeOut" });
        break;
      case "bezier":
        onChange({ kind: "bezier", from: { x: 1200, y: -80 }, control: { x: 2000, y: 600 }, to: { x: 1200, y: 1200 } });
        break;
      case "circle":
        onChange({ kind: "circle", center: { x: 1200, y: 800 }, radius: 320, startAngleDegrees: 0, clockwise: true });
        break;
      case "follow":
        onChange({ kind: "follow", target: "player", offsetX: 0, offsetY: 0, speed: 240 });
        break;
      case "drift":
        onChange({ kind: "drift", vx: 0, vy: 120 });
        break;
    }
  };
  return (
    <>
      <Row label="路径类型">
        <SelectField value={value.kind} options={PATH_KIND_OPTS} onChange={changeKind} />
      </Row>
      {value.kind === "point" && (
        <>
          <Row label="X"><NumberField value={value.x} onChange={(v) => onChange({ ...value, x: v })} /></Row>
          <Row label="Y"><NumberField value={value.y} onChange={(v) => onChange({ ...value, y: v })} /></Row>
        </>
      )}
      {value.kind === "line" && (
        <>
          <Row label="起点"><VecField value={value.from} onChange={(v) => onChange({ ...value, from: v })} /></Row>
          <Row label="终点"><VecField value={value.to} onChange={(v) => onChange({ ...value, to: v })} /></Row>
          <Row label="缓动"><SelectField value={value.ease ?? "linear"} options={EASE_OPTS} onChange={(v) => onChange({ ...value, ease: v })} /></Row>
        </>
      )}
      {value.kind === "bezier" && (
        <>
          <Row label="起点"><VecField value={value.from} onChange={(v) => onChange({ ...value, from: v })} /></Row>
          <Row label="控制点"><VecField value={value.control} onChange={(v) => onChange({ ...value, control: v })} /></Row>
          <Row label="终点"><VecField value={value.to} onChange={(v) => onChange({ ...value, to: v })} /></Row>
          <Row label="缓动"><SelectField value={value.ease ?? "linear"} options={EASE_OPTS} onChange={(v) => onChange({ ...value, ease: v })} /></Row>
        </>
      )}
      {value.kind === "circle" && (
        <>
          <Row label="圆心"><VecField value={value.center} onChange={(v) => onChange({ ...value, center: v })} /></Row>
          <Row label="半径"><NumberField value={value.radius} onChange={(v) => onChange({ ...value, radius: v })} /></Row>
          <Row label="起始角°"><NumberField value={value.startAngleDegrees} onChange={(v) => onChange({ ...value, startAngleDegrees: v })} /></Row>
          <Row label="顺时针"><Checkbox checked={value.clockwise ?? false} onChange={(v) => onChange({ ...value, clockwise: v })} /></Row>
          <Row label="缓动"><SelectField value={value.ease ?? "linear"} options={EASE_OPTS} onChange={(v) => onChange({ ...value, ease: v })} /></Row>
        </>
      )}
      {value.kind === "follow" && (
        <>
          <Row label="目标"><SelectField value={value.target} options={TARGET_OPTS} onChange={(v) => onChange({ ...value, target: v })} /></Row>
          <Row label="偏移X"><NumberField value={value.offsetX ?? 0} onChange={(v) => onChange({ ...value, offsetX: v })} /></Row>
          <Row label="偏移Y"><NumberField value={value.offsetY ?? 0} onChange={(v) => onChange({ ...value, offsetY: v })} /></Row>
          <Row label="速度"><NumberField value={value.speed ?? 120} onChange={(v) => onChange({ ...value, speed: v })} /></Row>
        </>
      )}
      {value.kind === "drift" && (
        <>
          <Row label="VX"><NumberField value={value.vx} onChange={(v) => onChange({ ...value, vx: v })} /></Row>
          <Row label="VY"><NumberField value={value.vy} onChange={(v) => onChange({ ...value, vy: v })} /></Row>
        </>
      )}
    </>
  );
}

// ───────────────────────── movement ─────────────────────────

function PhaseEditor({
  phase,
  onChange,
}: {
  phase: MovementPhase;
  onChange: (v: MovementPhase) => void;
}) {
  return (
    <>
      <Row label="起始秒"><NumberField value={phase.startSeconds} onChange={(v) => onChange({ ...phase, startSeconds: v })} /></Row>
      <Row label="持续秒"><NumberField value={phase.durationSeconds} onChange={(v) => onChange({ ...phase, durationSeconds: v })} /></Row>
      <Row label="循环"><Checkbox checked={phase.loop ?? false} onChange={(v) => onChange({ ...phase, loop: v })} /></Row>
      <div className="sub-block">
        <div className="sub-title">路径</div>
        <PathEditor value={phase.path} onChange={(p) => onChange({ ...phase, path: p })} />
      </div>
    </>
  );
}

function PhasesEditor({
  phases,
  onChange,
}: {
  phases: MovementPhase[];
  onChange: (v: MovementPhase[]) => void;
}) {
  return (
    <ListEditor
      items={phases}
      getKey={(_, i) => String(i)}
      addLabel="添加阶段"
      onAdd={() => onChange([...phases, defaultPhase()])}
      onRemove={(i) => onChange(phases.filter((_, k) => k !== i))}
      renderItem={(phase, i) => (
        <div className="phase-item">
          <div className="phase-head">阶段 {i + 1}</div>
          <PhaseEditor phase={phase} onChange={(p) => onChange(phases.map((x, k) => (k === i ? p : x)))} />
        </div>
      )}
    />
  );
}

export function MovementEditor({
  value,
  onChange,
}: {
  value: MovementSpec | undefined;
  onChange: (v: MovementSpec) => void;
}) {
  const isStatic = !!value && "type" in value && value.type === "static";
  const isPhases = !!value && "type" in value && value.type === "phases";
  const isSingle = !!value && !("type" in value);
  const currentType: "static" | "phases" | "single" = isStatic ? "static" : isPhases ? "phases" : "single";

  const changeType = (t: "static" | "phases" | "single") => {
    if (t === "static") onChange({ type: "static", x: 1200, y: 800 });
    else if (t === "phases") onChange({ type: "phases", phases: [defaultPhase()] });
    else onChange(defaultPhase());
  };

  return (
    <>
      <Row label="移动方式">
        <SelectField value={currentType} options={MOVEMENT_TYPE_OPTS} onChange={changeType} />
      </Row>
      {isStatic && (
        <>
          <Row label="X"><NumberField value={(value as { x: number }).x ?? 0} onChange={(v) => onChange({ type: "static", x: v, y: (value as { y: number }).y ?? 0 })} /></Row>
          <Row label="Y"><NumberField value={(value as { y: number }).y ?? 0} onChange={(v) => onChange({ type: "static", x: (value as { x: number }).x ?? 0, y: v })} /></Row>
        </>
      )}
      {isSingle && <PhaseEditor phase={value as MovementPhase} onChange={onChange} />}
      {isPhases && (
        <PhasesEditor
          phases={(value as { phases: MovementPhase[] }).phases}
          onChange={(phases) => onChange({ type: "phases", phases })}
        />
      )}
    </>
  );
}

// ───────────────────────── fire pattern ─────────────────────────

function LaserFields({
  value,
  onChange,
}: {
  value: LaserPattern;
  onChange: (v: FirePattern) => void;
}) {
  return (
    <>
      <Row label="目标"><SelectField value={value.target ?? "self"} options={TARGET_OPTS} onChange={(v) => onChange({ ...value, target: v })} /></Row>
      <Row label="固定角度°"><NumberField value={value.angleDegrees ?? 90} onChange={(v) => onChange({ ...value, angleDegrees: v })} /></Row>
      <Row label="长度"><NumberField value={value.length ?? 1000} onChange={(v) => onChange({ ...value, length: v })} /></Row>
      <Row label="宽度"><NumberField value={value.width ?? 20} onChange={(v) => onChange({ ...value, width: v })} /></Row>
      <Row label="持续秒"><NumberField value={value.durationSeconds} onChange={(v) => onChange({ ...value, durationSeconds: v })} /></Row>
      <Row label="延迟秒"><NumberField value={value.delaySeconds ?? 0} onChange={(v) => onChange({ ...value, delaySeconds: v || undefined })} /></Row>
      <Row label="伤害"><NumberField value={value.damage ?? 5} onChange={(v) => onChange({ ...value, damage: v })} /></Row>
      <Row label="速度档"><SelectField value={value.speedRank ?? "medium"} options={SPEED_OPTS} onChange={(v) => onChange({ ...value, speedRank: v })} /></Row>
      <Row label="贴图key"><TextField value={value.textureKey ?? ""} onChange={(v) => onChange({ ...value, textureKey: v || undefined })} /></Row>
    </>
  );
}

function PatternFields({
  value,
  onChange,
}: {
  value: BulletPattern;
  onChange: (v: FirePattern) => void;
}) {
  switch (value.type) {
    case "ring":
      return (
        <>
          <Row label="数量"><NumberField value={value.count} onChange={(v) => onChange({ ...value, count: v })} /></Row>
          <Row label="起始角°"><NumberField value={value.startAngleDegrees ?? 0} onChange={(v) => onChange({ ...value, startAngleDegrees: v })} /></Row>
          <Row label="每发旋转°"><NumberField value={value.rotationDegreesPerShot ?? 0} onChange={(v) => onChange({ ...value, rotationDegreesPerShot: v })} /></Row>
          <Row label="每秒旋转°"><NumberField value={value.rotationDegreesPerSecond ?? 0} onChange={(v) => onChange({ ...value, rotationDegreesPerSecond: v })} /></Row>
        </>
      );
    case "spread":
      return (
        <>
          <Row label="数量"><NumberField value={value.count} onChange={(v) => onChange({ ...value, count: v })} /></Row>
          <Row label="中心角°"><NumberField value={value.centerDegrees} onChange={(v) => onChange({ ...value, centerDegrees: v })} /></Row>
          <Row label="张角°"><NumberField value={value.arcDegrees} onChange={(v) => onChange({ ...value, arcDegrees: v })} /></Row>
        </>
      );
    case "spiral":
      return (
        <>
          <Row label="臂数"><NumberField value={value.arms} onChange={(v) => onChange({ ...value, arms: v })} /></Row>
          <Row label="每臂数量"><NumberField value={value.count} onChange={(v) => onChange({ ...value, count: v })} /></Row>
          <Row label="角速度°/s"><NumberField value={value.angularSpeedDegreesPerSecond} onChange={(v) => onChange({ ...value, angularSpeedDegreesPerSecond: v })} /></Row>
          <Row label="起始角°"><NumberField value={value.startAngleDegrees ?? 0} onChange={(v) => onChange({ ...value, startAngleDegrees: v })} /></Row>
        </>
      );
    case "aimed":
      return (
        <>
          <Row label="目标"><SelectField value={value.target} options={TARGET_OPTS} onChange={(v) => onChange({ ...value, target: v })} /></Row>
          <Row label="数量"><NumberField value={value.count ?? 1} onChange={(v) => onChange({ ...value, count: v })} /></Row>
          <Row label="扩散°"><NumberField value={value.spreadDegrees ?? 0} onChange={(v) => onChange({ ...value, spreadDegrees: v })} /></Row>
        </>
      );
    case "custom":
      return (
        <Row label="角度°(逗号)">
          <TextField
            value={value.anglesDegrees.join(", ")}
            onChange={(t) => {
              const arr = t
                .split(",")
                .map((x) => parseFloat(x.trim()))
                .filter((n) => Number.isFinite(n));
              onChange({ ...value, anglesDegrees: arr });
            }}
          />
        </Row>
      );
    default:
      return null;
  }
}

export function PatternEditor({
  value,
  onChange,
}: {
  value: FirePattern;
  onChange: (v: FirePattern) => void;
}) {
  const changeType = (t: FirePattern["type"]) => {
    switch (t) {
      case "ring":
        onChange({ type: "ring", count: 12, startAngleDegrees: 0, bullet: defaultBulletParams() });
        break;
      case "spread":
        onChange({ type: "spread", count: 5, centerDegrees: 90, arcDegrees: 60, bullet: defaultBulletParams() });
        break;
      case "spiral":
        onChange({ type: "spiral", arms: 4, count: 2, angularSpeedDegreesPerSecond: 90, startAngleDegrees: 0, bullet: defaultBulletParams() });
        break;
      case "aimed":
        onChange({ type: "aimed", target: "player", count: 3, spreadDegrees: 10, bullet: defaultBulletParams() });
        break;
      case "custom":
        onChange({ type: "custom", anglesDegrees: [0, 45, 90], bullet: defaultBulletParams() });
        break;
      case "laser":
        onChange({ type: "laser", durationSeconds: 2, angleDegrees: 90, damage: 5, speedRank: "medium" });
        break;
    }
  };
  return (
    <>
      <Row label="弹幕类型">
        <SelectField value={value.type} options={PATTERN_TYPE_OPTS} onChange={changeType} />
      </Row>
      {value.type === "laser" ? (
        <LaserFields value={value} onChange={onChange} />
      ) : (
        <>
          <BulletParamsEditor value={value.bullet} onChange={(b) => onChange({ ...value, bullet: b } as FirePattern)} />
          <PatternFields value={value} onChange={onChange} />
        </>
      )}
    </>
  );
}

// ───────────────────────── fire list ─────────────────────────

export function FireListEditor({
  value,
  onChange,
  label = "开火规则",
}: {
  value: FireSpec[];
  onChange: (v: FireSpec[]) => void;
  label?: string;
}) {
  return (
    <Section
      title={label}
      actions={<Button variant="ghost" onClick={() => onChange([...value, defaultFireSpec()])}>+ 添加</Button>}
    >
      {value.length === 0 && <div className="muted small">暂无开火规则</div>}
      {value.map((spec, i) => (
        <div className="fire-item" key={spec.id ?? i}>
          <div className="fire-head">
            <span>开火 #{i + 1} {spec.id ? `(${spec.id})` : ""}</span>
            <button className="btn ghost tiny" onClick={() => onChange(value.filter((_, k) => k !== i))}>✕</button>
          </div>
          <Row label="id"><TextField value={spec.id ?? ""} onChange={(v) => onChange(value.map((x, k) => (k === i ? { ...x, id: v || undefined } : x)))} /></Row>
          <Row label="起始秒"><NumberField value={spec.startSeconds} onChange={(v) => onChange(value.map((x, k) => (k === i ? { ...x, startSeconds: v } : x)))} /></Row>
          <Row label="间隔秒"><NumberField value={spec.intervalSeconds} onChange={(v) => onChange(value.map((x, k) => (k === i ? { ...x, intervalSeconds: v } : x)))} /></Row>
          <Row label="次数(0=无限)"><NumberField value={spec.repeat ?? 0} onChange={(v) => onChange(value.map((x, k) => (k === i ? { ...x, repeat: v > 0 ? v : undefined } : x)))} /></Row>
          <Row label="启用"><Checkbox checked={spec.enabled !== false} onChange={(v) => onChange(value.map((x, k) => (k === i ? { ...x, enabled: v } : x)))} /></Row>
          <Row label="符卡阶段"><NumberField value={spec.phase ?? 0} onChange={(v) => onChange(value.map((x, k) => (k === i ? { ...x, phase: v } : x)))} /></Row>
          <div className="sub-block">
            <div className="sub-title">弹幕样式</div>
            <PatternEditor value={spec.pattern} onChange={(p) => onChange(value.map((x, k) => (k === i ? { ...x, pattern: p } : x)))} />
          </div>
        </div>
      ))}
    </Section>
  );
}
