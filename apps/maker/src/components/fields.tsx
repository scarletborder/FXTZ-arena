import React from "react";

export function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-head">
        <h3>{title}</h3>
        <div className="section-actions">{actions}</div>
      </div>
      <div className="section-body">{children}</div>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="row">
      <span className="row-label">{label}</span>
      <span className="row-control">{children}</span>
    </label>
  );
}

export function NumberField({
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      className="input num"
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
    />
  );
}

export function TextField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      className="input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      className="input area"
      value={value}
      rows={6}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <input type="text" className="input small" value={value} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

export function Button({ children, onClick, variant = "default", disabled }: { children: React.ReactNode; onClick: () => void; variant?: "default" | "primary" | "danger" | "ghost"; disabled?: boolean }) {
  return (
    <button className={`btn ${variant}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return <span className="tag" style={color ? { background: color } : undefined}>{children}</span>;
}

export function VecField({ value, onChange }: { value: { x: number; y: number }; onChange: (v: { x: number; y: number }) => void }) {
  return (
    <span className="vec">
      <NumberField value={value.x} onChange={(x) => onChange({ ...value, x })} />
      <NumberField value={value.y} onChange={(y) => onChange({ ...value, y })} />
    </span>
  );
}

export function ListEditor<T>({
  items,
  getKey,
  renderItem,
  onAdd,
  onRemove,
  addLabel = "添加",
}: {
  items: T[];
  getKey: (item: T, i: number) => string;
  renderItem: (item: T, i: number) => React.ReactNode;
  onAdd: () => void;
  onRemove: (i: number) => void;
  addLabel?: string;
}) {
  return (
    <div className="list-editor">
      {items.map((item, i) => (
        <div className="list-item" key={getKey(item, i)}>
          <div className="list-item-body">{renderItem(item, i)}</div>
          <button className="btn ghost tiny" onClick={() => onRemove(i)} title="删除">
            ✕
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={onAdd}>{addLabel}</Button>
    </div>
  );
}
