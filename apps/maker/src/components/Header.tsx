import { useRef, useState } from "react";
import { makerStore, useStage } from "../store";
import { validateStageDocument } from "@repo/stage-schema";
import { Button, TextField } from "./fields";

export function Header() {
  const stage = useStage();
  const projects = makerStore.getProjects();
  const currentId = makerStore.getCurrentId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const exportJson = () => {
    if (!stage) return;
    const blob = new Blob([JSON.stringify(stage, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stage.id || "stage"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = async () => {
    if (!stage) return;
    await navigator.clipboard.writeText(JSON.stringify(stage, null, 2));
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const res = makerStore.importStage(text);
      if (!res.ok) alert("导入失败：" + res.error);
    });
    e.target.value = "";
  };

  const runValidate = () => {
    if (!stage) return;
    const iss = validateStageDocument(stage).filter((i) => i.severity === "error");
    setIssues(iss.length === 0 ? ["✓ 校验通过，无错误。"] : iss.map((i) => `• ${i.path}: ${i.message}`));
  };

  return (
    <header className="header">
      <div className="brand">
        <span className="logo">◈</span>
        <span>STG 关卡制作器</span>
      </div>

      <div className="header-project">
        {stage ? (
          <TextField
            value={stage.name}
            onChange={(v) => currentId && makerStore.renameProject(currentId, v)}
          />
        ) : (
          <span className="muted">未打开关卡</span>
        )}
      </div>

      <div className="header-actions">
        <div className="dropdown">
          <Button onClick={() => setMenuOpen((o) => !o)}>＋ 新建</Button>
          {menuOpen && (
            <div className="dropdown-menu" onMouseLeave={() => setMenuOpen(false)}>
              <button onClick={() => { makerStore.createProject("新关卡", false); setMenuOpen(false); }}>空白关卡</button>
              <button onClick={() => { makerStore.createProject("示例关卡", true); setMenuOpen(false); }}>从示例创建</button>
            </div>
          )}
        </div>

        <Button variant="ghost" onClick={() => fileRef.current?.click()}>导入 JSON</Button>
        <Button variant="ghost" onClick={exportJson} disabled={!stage}>导出 JSON</Button>
        <Button variant="ghost" onClick={copyJson} disabled={!stage}>复制</Button>
        <Button variant="ghost" onClick={runValidate} disabled={!stage}>校验</Button>
        {issues && (
          <span className={`validate ${issues[0].startsWith("✓") ? "ok" : "bad"}`} onClick={() => setIssues(null)}>
            {issues.length} 项
          </span>
        )}
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={onImportFile} />
      </div>

      {issues && (
        <div className="issues-pop">
          {issues.map((i, k) => (
            <div key={k}>{i}</div>
          ))}
          <button className="btn tiny ghost" onClick={() => setIssues(null)}>关闭</button>
        </div>
      )}

      <span className="project-count muted">{projects.length} 个项目</span>
    </header>
  );
}
