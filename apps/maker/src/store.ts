import { useSyncExternalStore } from "react";
import {
  createEmptyStage,
  createSampleStage,
  type StageDocument,
} from "@repo/stage-schema";

const PROJECTS_KEY = "fxtz-maker:projects";
const STAGE_PREFIX = "fxtz-maker:stage:";

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function readProjects(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProjectMeta[];
  } catch {
    return [];
  }
}

function writeProjects(list: ProjectMeta[]): void {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
}

function readStage(id: string): StageDocument | null {
  try {
    const raw = localStorage.getItem(STAGE_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as StageDocument;
  } catch {
    return null;
  }
}

function writeStage(id: string, stage: StageDocument): void {
  localStorage.setItem(STAGE_PREFIX + id, JSON.stringify(stage));
}

class MakerStore {
  private projects: ProjectMeta[] = readProjects();
  private currentId: string | null = null;
  private stage: StageDocument | null = null;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  getProjects = (): ProjectMeta[] => this.projects;

  getCurrentId = (): string | null => this.currentId;

  getStage = (): StageDocument | null => this.stage;

  openProject(id: string): void {
    const stage = readStage(id);
    if (!stage) return;
    this.currentId = id;
    this.stage = stage;
    this.touchProject(id);
    this.emit();
  }

  createProject(name: string, fromSample = false): string {
    const id = uid();
    const stage = fromSample
      ? createSampleStage()
      : createEmptyStage({ id, name });
    stage.id = id;
    stage.name = name;
    this.projects = [
      { id, name, updatedAt: Date.now() },
      ...this.projects,
    ];
    writeProjects(this.projects);
    writeStage(id, stage);
    this.currentId = id;
    this.stage = stage;
    this.emit();
    return id;
  }

  deleteProject(id: string): void {
    this.projects = this.projects.filter((p) => p.id !== id);
    writeProjects(this.projects);
    localStorage.removeItem(STAGE_PREFIX + id);
    if (this.currentId === id) {
      this.currentId = null;
      this.stage = null;
    }
    this.emit();
  }

  renameProject(id: string, name: string): void {
    this.projects = this.projects.map((p) =>
      p.id === id ? { ...p, name } : p,
    );
    writeProjects(this.projects);
    if (this.stage && this.stage.id === id) {
      this.stage = { ...this.stage, name };
      writeStage(id, this.stage);
    }
    this.emit();
  }

  private touchProject(id: string): void {
    this.projects = this.projects.map((p) =>
      p.id === id ? { ...p, updatedAt: Date.now() } : p,
    );
    writeProjects(this.projects);
  }

  /** Apply an immutable update to the current stage. */
  mutate(fn: (draft: StageDocument) => void): void {
    if (!this.stage || !this.currentId) return;
    const next: StageDocument = structuredClone(this.stage);
    fn(next);
    this.stage = next;
    writeStage(this.currentId, next);
    this.touchProject(this.currentId);
    this.emit();
  }

  setStage(stage: StageDocument): void {
    if (!this.currentId) return;
    this.stage = stage;
    writeStage(this.currentId, stage);
    this.touchProject(this.currentId);
    this.emit();
  }

  importStage(json: string): { ok: boolean; error?: string } {
    try {
      const parsed = JSON.parse(json) as StageDocument;
      if (!parsed || parsed.schemaVersion !== 1 || !parsed.id) {
        return { ok: false, error: "不是有效的关卡 JSON（需要 schemaVersion:1 与 id）" };
      }
      const id = this.currentId ?? uid();
      parsed.id = id;
      this.projects = [
        { id, name: parsed.name ?? "导入关卡", updatedAt: Date.now() },
        ...this.projects.filter((p) => p.id !== id),
      ];
      writeProjects(this.projects);
      writeStage(id, parsed);
      this.currentId = id;
      this.stage = parsed;
      this.emit();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

export const makerStore = new MakerStore();

export function useMakerStore<T>(selector: (s: MakerStore) => T): T {
  return useSyncExternalStore(
    makerStore.subscribe,
    () => selector(makerStore),
    () => selector(makerStore),
  );
}

export function useStage(): StageDocument | null {
  return useSyncExternalStore(makerStore.subscribe, makerStore.getStage, makerStore.getStage);
}
