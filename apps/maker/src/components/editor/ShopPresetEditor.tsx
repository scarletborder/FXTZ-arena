import { makerStore, useStage } from "../../store";
import type { ShopConfig } from "@repo/stage-schema";
import { Button, NumberField, Row, Section, TextField } from "../fields";

export function ShopPresetEditor({ id }: { id: string }) {
  const stage = useStage();
  if (!stage) return null;
  const presets = stage.shopPresets ?? {};
  const preset = presets[id];
  if (!preset) return <div className="editor-scroll muted">商店预设不存在</div>;
  const m = makerStore.mutate;
  const update = (fn: (p: ShopConfig) => void) => m((s) => { const p = (s.shopPresets ??= {})[id]; if (p) fn(p); });
  const remove = () => m((s) => { if (s.shopPresets) delete s.shopPresets[id]; });

  return (
    <div className="editor-scroll">
      <Section title={`商店预设：${preset.id}`} actions={<Button variant="danger" onClick={remove}>删除预设</Button>}>
        <Row label="id"><TextField value={preset.id} onChange={(v) => update((p) => { p.id = v; })} /></Row>
        <Row label="名称"><TextField value={preset.name ?? ""} onChange={(v) => update((p) => { p.name = v || undefined; })} /></Row>
        <Row label="普通抽取"><NumberField value={preset.rarityPulls.common ?? 0} onChange={(v) => update((p) => { p.rarityPulls.common = v; })} /></Row>
        <Row label="稀有抽取"><NumberField value={preset.rarityPulls.rare ?? 0} onChange={(v) => update((p) => { p.rarityPulls.rare = v; })} /></Row>
      </Section>
    </div>
  );
}
