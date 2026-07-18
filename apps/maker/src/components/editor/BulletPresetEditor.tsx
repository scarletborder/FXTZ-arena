import { makerStore, useStage } from "../../store";
import type { BulletPreset } from "@repo/stage-schema";
import { Button, Row, Section, TextField } from "../fields";
import { BulletParamsEditor } from "./parts";

export function BulletPresetEditor({ id }: { id: string }) {
  const stage = useStage();
  if (!stage) return null;
  const presets = stage.bulletPresets ?? {};
  const preset = presets[id];
  if (!preset) return <div className="editor-scroll muted">弹幕预设不存在</div>;
  const m = makerStore.mutate;
  const update = (fn: (p: BulletPreset) => void) => m((s) => { const p = (s.bulletPresets ??= {})[id]; if (p) fn(p); });
  const remove = () => m((s) => { if (s.bulletPresets) delete s.bulletPresets[id]; });

  return (
    <div className="editor-scroll">
      <Section title={`弹幕预设：${preset.id}`} actions={<Button variant="danger" onClick={remove}>删除预设</Button>}>
        <Row label="id"><TextField value={preset.id} onChange={(v) => update((p) => { p.id = v; })} /></Row>
        <BulletParamsEditor value={preset.bullet} onChange={(b) => update((p) => { p.bullet = b; })} />
      </Section>
    </div>
  );
}
