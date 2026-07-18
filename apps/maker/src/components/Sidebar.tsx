import { makerStore, useStage } from "../store";
import type { Selection } from "../editor-types";
import { Tag } from "./fields";

export function Sidebar({
  selection,
  onSelect,
}: {
  selection: Selection;
  onSelect: (s: Selection) => void;
}) {
  const stage = useStage();
  const projects = makerStore.getProjects();
  const currentId = makerStore.getCurrentId();

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-title">项目</div>
        <div className="project-list">
          {projects.length === 0 && <div className="muted small">暂无项目，点击右上角“新建”。</div>}
          {projects.map((p) => (
            <div
              key={p.id}
              className={`project-item ${p.id === currentId ? "active" : ""}`}
              onClick={() => makerStore.openProject(p.id)}
            >
              <span className="project-name">{p.name}</span>
              <button
                className="btn ghost tiny"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`删除项目“${p.name}”？`)) makerStore.deleteProject(p.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {stage && (
        <div className="sidebar-section grow">
          <div className="sidebar-title">关卡结构</div>
          <NavItem active={selection.kind === "overview"} onClick={() => onSelect({ kind: "overview" })}>
            概览
          </NavItem>
          <NavItem active={selection.kind === "preview"} onClick={() => onSelect({ kind: "preview" })}>
            实时预览
          </NavItem>

          <div className="nav-group-label">节点时间线 ({stage.nodes.length})</div>
          {stage.nodes.map((node, i) => (
            <NavItem
              key={node.id}
              indent
              active={selection.kind === "node" && selection.index === i}
              onClick={() => onSelect({ kind: "node", index: i })}
            >
              <span className={`node-badge ${node.kind}`}>{node.kind === "wave" ? "波" : "店"}</span>
              {node.id}
            </NavItem>
          ))}

          <div className="nav-group-label">敌人定义 ({Object.keys(stage.enemyDefs).length})</div>
          {Object.values(stage.enemyDefs).map((def) => (
            <NavItem
              key={def.id}
              indent
              active={selection.kind === "enemy" && selection.id === def.id}
              onClick={() => onSelect({ kind: "enemy", id: def.id })}
            >
              <Tag color={classColor(def.class)}>{def.class}</Tag>
              {def.id}
            </NavItem>
          ))}

          <div className="nav-group-label">弹幕预设 ({Object.keys(stage.bulletPresets ?? {}).length})</div>
          {Object.values(stage.bulletPresets ?? {}).map((b) => (
            <NavItem
              key={b.id}
              indent
              active={selection.kind === "bullet" && selection.id === b.id}
              onClick={() => onSelect({ kind: "bullet", id: b.id })}
            >
              {b.id}
            </NavItem>
          ))}

          <div className="nav-group-label">商店预设 ({Object.keys(stage.shopPresets ?? {}).length})</div>
          {Object.values(stage.shopPresets ?? {}).map((s) => (
            <NavItem
              key={s.id}
              indent
              active={selection.kind === "shop" && selection.id === s.id}
              onClick={() => onSelect({ kind: "shop", id: s.id })}
            >
              {s.id}
            </NavItem>
          ))}

          <NavItem active={selection.kind === "json"} onClick={() => onSelect({ kind: "json" })}>
            原始 JSON
          </NavItem>
        </div>
      )}
    </aside>
  );
}

function NavItem({
  children,
  active,
  indent,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  indent?: boolean;
  onClick: () => void;
}) {
  return (
    <div className={`nav-item ${active ? "active" : ""} ${indent ? "indent" : ""}`} onClick={onClick}>
      {children}
    </div>
  );
}

function classColor(c: string): string {
  if (c === "boss") return "#ff4d6d";
  if (c === "elite") return "#ffa94d";
  return "#5ad1ff";
}
