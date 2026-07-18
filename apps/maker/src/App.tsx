import { useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { PreviewPanel } from "./components/PreviewPanel";
import { StageOverview } from "./components/editor/StageOverview";
import { NodeEditor } from "./components/editor/NodeEditor";
import { EnemyEditor } from "./components/editor/EnemyEditor";
import { BulletPresetEditor } from "./components/editor/BulletPresetEditor";
import { ShopPresetEditor } from "./components/editor/ShopPresetEditor";
import { JsonView } from "./components/editor/JsonView";
import type { Selection } from "./editor-types";
import { useMakerStore, useStage } from "./store";
import type { StageDocument } from "@repo/stage-schema";

interface Tab {
  id: string;
  selection: Selection;
}

function selectionId(sel: Selection): string {
  switch (sel.kind) {
    case "node":
      return `node:${sel.index}`;
    case "enemy":
      return `enemy:${sel.id}`;
    case "bullet":
      return `bullet:${sel.id}`;
    case "shop":
      return `shop:${sel.id}`;
    default:
      return sel.kind;
  }
}

function selectionTitle(sel: Selection, stage: StageDocument | null): string {
  switch (sel.kind) {
    case "overview":
      return "概览";
    case "preview":
      return "实时预览";
    case "json":
      return "原始 JSON";
    case "node": {
      const node = stage?.nodes[sel.index];
      if (!node) return `节点 #${sel.index + 1}`;
      return node.kind === "wave" ? `${node.id} 波次编辑` : `${node.id} 商店编辑`;
    }
    case "enemy": {
      const def = stage?.enemyDefs[sel.id];
      const name = def?.displayName ? `${def.id}(${def.displayName})` : sel.id;
      return `${name} 敌人`;
    }
    case "bullet":
      return `${sel.id} 弹幕预设`;
    case "shop":
      return `${sel.id} 商店预设`;
  }
}

const OVERVIEW_TAB: Tab = { id: "overview", selection: { kind: "overview" } };

export default function App() {
  const stage = useStage();
  const currentId = useMakerStore((s) => s.getCurrentId());
  const [tabs, setTabs] = useState<Tab[]>([OVERVIEW_TAB]);
  const [activeId, setActiveId] = useState<string>("overview");
  const prevProjectRef = useRef<string | null>(currentId);

  // Reset the tab set whenever the active project changes.
  useEffect(() => {
    if (prevProjectRef.current !== currentId) {
      prevProjectRef.current = currentId;
      setTabs([OVERVIEW_TAB]);
      setActiveId("overview");
    }
  }, [currentId]);

  const openTab = (selection: Selection) => {
    const id = selectionId(selection);
    setTabs((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, { id, selection }]));
    setActiveId(id);
  };

  const closeTab = (id: string) => {
    if (id === "overview") return;
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (activeId === id) {
        const fallback = next[Math.max(0, idx - 1)] ?? OVERVIEW_TAB;
        setActiveId(fallback.id);
      }
      return next.length > 0 ? next : [OVERVIEW_TAB];
    });
  };

  const active = tabs.find((t) => t.id === activeId) ?? OVERVIEW_TAB;
  const selection = active.selection;
  const focusNodeIndex = selection.kind === "node" ? selection.index : null;

  return (
    <div className="app">
      <Header />
      <div className="app-body">
        <Sidebar selection={selection} onSelect={openTab} />
        <div className="editor-column">
          <div className="tab-bar">
            {tabs.map((t) => (
              <div
                key={t.id}
                className={`tab ${t.id === activeId ? "active" : ""}`}
                onClick={() => setActiveId(t.id)}
              >
                <span className="tab-title">{selectionTitle(t.selection, stage)}</span>
                {t.id !== "overview" && (
                  <button
                    className="tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(t.id);
                    }}
                    title="关闭标签"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <main className="editor-area">
            {!stage ? (
              <div className="empty-state">
                <h2>欢迎使用 STG 关卡制作器</h2>
                <p>点击右上角「新建」创建空白关卡，或从示例开始。</p>
              </div>
            ) : selection.kind === "overview" ? (
              <StageOverview onSelect={openTab} />
            ) : selection.kind === "node" ? (
              <NodeEditor index={selection.index} openTab={openTab} />
            ) : selection.kind === "enemy" ? (
              <EnemyEditor id={selection.id} />
            ) : selection.kind === "bullet" ? (
              <BulletPresetEditor id={selection.id} />
            ) : selection.kind === "shop" ? (
              <ShopPresetEditor id={selection.id} />
            ) : selection.kind === "preview" ? (
              <PreviewPanel large />
            ) : (
              <JsonView />
            )}
          </main>
        </div>
        <PreviewPanel focusNodeIndex={focusNodeIndex} />
      </div>
    </div>
  );
}
