import { makerStore, useStage } from "../../store";
import type {
  EnemyDefinition,
  DeathRule,
  SpellPhase,
  SpellCardConfig,
} from "@repo/stage-schema";
import {
  Button,
  NumberField,
  Row,
  Section,
  SelectField,
  TextField,
  VecField,
  Checkbox,
  ColorField,
  ListEditor,
} from "../fields";
import {
  CLASS_OPTS,
  MovementEditor,
  FireListEditor,
  numToHex,
  hexToNum,
  defaultFormRule,
  defaultSpellPhase,
  RewardDropsEditor,
} from "./parts";

export function EnemyEditor({ id }: { id: string }) {
  const stage = useStage();
  if (!stage) return null;
  const def = stage.enemyDefs[id];
  if (!def) return <div className="editor-scroll muted">敌人定义不存在</div>;
  const m = makerStore.mutate;

  const update = (fn: (d: EnemyDefinition) => void) => m((s) => { const d = s.enemyDefs[id]; if (d) fn(d); });
  const remove = () => m((s) => { delete s.enemyDefs[id]; });

  const forms = def.forms ?? [];
  const spell = def.spellCard;

  return (
    <div className="editor-scroll">
      <Section title={`敌人定义：${def.id}`} actions={<Button variant="danger" onClick={remove}>删除敌人</Button>}>
        <Row label="id"><TextField value={def.id} onChange={(v) => update((d) => { d.id = v; })} /></Row>
        <Row label="显示名"><TextField value={def.displayName ?? ""} onChange={(v) => update((d) => { d.displayName = v || undefined; })} /></Row>
        <Row label="贴图 key"><TextField value={def.textureKey ?? ""} onChange={(v) => update((d) => { d.textureKey = v || undefined; })} /></Row>
        <Row label="类别"><SelectField value={def.class} options={CLASS_OPTS} onChange={(v) => update((d) => { d.class = v; })} /></Row>
        <Row label="最大血量"><NumberField value={def.maxHealth} onChange={(v) => update((d) => { d.maxHealth = v; })} /></Row>
        <Row label="命中半径"><NumberField value={def.hitRadius} onChange={(v) => update((d) => { d.hitRadius = v; })} /></Row>
        <Row label="命中宽"><NumberField value={def.hitWidth ?? 0} onChange={(v) => update((d) => { d.hitWidth = v || undefined; })} /></Row>
        <Row label="命中高"><NumberField value={def.hitHeight ?? 0} onChange={(v) => update((d) => { d.hitHeight = v || undefined; })} /></Row>
        <Row label="出生点"><VecField value={def.spawn ?? { x: 600, y: -40 }} onChange={(v) => update((d) => { d.spawn = v; })} /></Row>
        <Row label="染色">
          <ColorField value={numToHex(def.tint ?? 0x9b8cff)} onChange={(v) => update((d) => { d.tint = hexToNum(v); })} />
        </Row>
      </Section>

      <Section title="掉落物 (drops)">
        <RewardDropsEditor
          value={def.rewards}
          onChange={(v) => update((d) => { d.rewards = v; })}
        />
      </Section>

      <Section title="移动">
        <MovementEditor value={def.movement} onChange={(v) => update((d) => { d.movement = v; })} />
      </Section>

      <FireListEditor value={def.fire ?? []} onChange={(f) => update((d) => { d.fire = f; })} label="开火规则" />

      <Section title="形态切换" actions={<Button variant="ghost" onClick={() => update((d) => { d.forms = [...(d.forms ?? []), defaultFormRule()]; })}>+ 添加</Button>}>
        {forms.length === 0 && <div className="muted small">无形态切换规则</div>}
        <ListEditor
          items={forms}
          getKey={(_, i) => String(i)}
          addLabel="添加规则"
          onAdd={() => update((d) => { d.forms = [...(d.forms ?? []), defaultFormRule()]; })}
          onRemove={(i) => update((d) => { d.forms = (d.forms ?? []).filter((_, k) => k !== i); })}
          renderItem={(rule, i) => (
            <div className="form-item">
              <Row label="触发">
                <SelectField
                  value={rule.when}
                  options={[
                    { value: "healthBelow", label: "血量低于" },
                    { value: "healthAbove", label: "血量高于" },
                    { value: "ageAbove", label: "存活超过" },
                    { value: "always", label: "总是" },
                  ]}
                  onChange={(v) => update((d) => { d.forms = (d.forms ?? []).map((x, k) => (k === i ? { ...x, when: v } : x)); })}
                />
              </Row>
              <Row label="阈值"><NumberField value={rule.threshold ?? 0} onChange={(v) => update((d) => { d.forms = (d.forms ?? []).map((x, k) => (k === i ? { ...x, threshold: v } : x)); })} /></Row>
              <Row label="形态名"><TextField value={rule.form} onChange={(v) => update((d) => { d.forms = (d.forms ?? []).map((x, k) => (k === i ? { ...x, form: v } : x)); })} /></Row>
            </div>
          )}
        />
      </Section>

      <Section title="死亡规则">
        <Row label="血量归零死亡"><Checkbox checked={def.death?.onHealthZero ?? true} onChange={(v) => update((d) => { d.death = { ...(d.death ?? {}), onHealthZero: v } as DeathRule; })} /></Row>
        <Row label="最大存活秒"><NumberField value={def.death?.maxAgeSeconds ?? 0} onChange={(v) => update((d) => { d.death = { ...(d.death ?? {}), maxAgeSeconds: v || undefined } as DeathRule; })} /></Row>
        <Row label="离场即死"><Checkbox checked={def.death?.leaveScreen ?? false} onChange={(v) => update((d) => { d.death = { ...(d.death ?? {}), leaveScreen: v } as DeathRule; })} /></Row>
        <Row label="无敌"><Checkbox checked={def.death?.invincible ?? false} onChange={(v) => update((d) => { d.death = { ...(d.death ?? {}), invincible: v } as DeathRule; })} /></Row>
      </Section>

      <Section
        title="符卡 (Boss/精英)"
        actions={
          !spell ? (
            <Button variant="ghost" onClick={() => update((d) => { d.spellCard = { phases: [defaultSpellPhase()] }; })}>+ 启用符卡</Button>
          ) : (
            <Button variant="ghost" onClick={() => update((d) => { d.spellCard = undefined; })}>关闭符卡</Button>
          )
        }
      >
        {spell && (
          <SpellCardEditor
            spell={spell}
            onChange={(s) => update((d) => { d.spellCard = s; })}
          />
        )}
      </Section>
    </div>
  );
}

function SpellCardEditor({
  spell,
  onChange,
}: {
  spell: SpellCardConfig;
  onChange: (s: SpellCardConfig) => void;
}) {
  const phases = spell.phases;
  const updatePhase = (i: number, fn: (p: SpellPhase) => void) =>
    onChange({ phases: phases.map((p, k) => (k === i ? (() => { const c = { ...p }; fn(c); return c; })() : p)) });

  return (
    <div className="spell-card">
      {phases.map((phase, i) => (
        <div className="spell-phase" key={i}>
          <div className="spell-phase-head">
            <span>符卡阶段 {i + 1}</span>
            <button className="btn ghost tiny" onClick={() => onChange({ phases: phases.filter((_, k) => k !== i) })}>✕</button>
          </div>
          <Row label="名称"><TextField value={phase.name} onChange={(v) => updatePhase(i, (p) => { p.name = v; })} /></Row>
          <Row label="血量"><NumberField value={phase.maxHealth} onChange={(v) => updatePhase(i, (p) => { p.maxHealth = v; })} /></Row>
          <Row label="持续秒"><NumberField value={phase.durationSeconds} onChange={(v) => updatePhase(i, (p) => { p.durationSeconds = v; })} /></Row>
          <div className="sub-block">
            <div className="sub-title">本阶段移动</div>
            <MovementEditor value={phase.movement} onChange={(v) => updatePhase(i, (p) => { p.movement = v; })} />
          </div>
          <FireListEditor value={phase.fire ?? []} onChange={(f) => updatePhase(i, (p) => { p.fire = f; })} label="本阶段开火" />
        </div>
      ))}
      <Button variant="ghost" onClick={() => onChange({ phases: [...phases, defaultSpellPhase()] })}>+ 添加符卡阶段</Button>
    </div>
  );
}
