import { useState } from "react";
import { makerStore, useStage } from "../../store";
import { Button, TextArea } from "../fields";

export function JsonView() {
  const stage = useStage();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!stage) return null;
  const current = text ?? JSON.stringify(stage, null, 2);

  const apply = () => {
    if (text == null) return;
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.schemaVersion === 1 && parsed.id) {
        makerStore.setStage(parsed);
        setError(null);
        setText(null);
      } else {
        setError("需要 schemaVersion:1 与 id");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="editor-scroll json-view">
      <div className="json-toolbar">
        <Button variant="primary" onClick={apply} disabled={text == null}>应用修改</Button>
        <Button variant="ghost" onClick={() => { setText(JSON.stringify(stage, null, 2)); setError(null); }}>载入到编辑器</Button>
        <Button variant="ghost" onClick={() => { setText(null); setError(null); }}>取消</Button>
        {error && <span className="validate bad">{error}</span>}
      </div>
      <TextArea value={current} onChange={(v) => { setText(v); setError(null); }} />
    </div>
  );
}
