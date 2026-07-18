import type { NeutralMobState, NeutralMobSpawnerState } from "@repo/types";
import type {
  StageDocument,
  StageNode,
  WaveMemberSpec,
  EnemyDefinition,
  Vec2,
  FormationSpec,
} from "@repo/stage-schema";
import {
  type CollaborateSpawnerNode,
  type WaveMemberDefinition,
  type WaveSpawnerState,
  type WaveDefinition,
  type ShopDefinition,
} from "../collaborate/wave-types";
import { WaveMobSpawner } from "../collaborate/wave-spawner";
import type { BattleNeutralMob, NeutralMobSpawnerContext } from "../base";
import { JsonMob } from "./json-mob";

export interface JsonMobSpawnerState extends WaveSpawnerState, NeutralMobSpawnerState {
  readonly spawnerId: string;
}

export class JsonMobSpawner extends WaveMobSpawner<JsonMobSpawnerState> {
  readonly id: string;
  private readonly doc: StageDocument;
  protected readonly nodes: readonly CollaborateSpawnerNode[];

  constructor(doc: StageDocument) {
    super();
    this.doc = doc;
    this.id = `json:${doc.id}`;
    this.nodes = doc.nodes.map((node) => this.buildNode(node));
  }

  createMobFromSnapshot(snapshot: NeutralMobState): BattleNeutralMob | undefined {
    return JsonMob.fromSnapshot(this.doc, snapshot);
  }

  private buildNode(node: StageNode): CollaborateSpawnerNode {
    if (node.kind === "shop") {
      const preset = node.presetId ? this.doc.shopPresets?.[node.presetId] : undefined;
      const shop: ShopDefinition = {
        id: node.id,
        kind: "shop",
        x: node.x,
        y: node.y,
        rarityPulls: preset?.rarityPulls ?? node.rarityPulls,
      };
      return shop;
    }
    const wave: WaveDefinition = {
      id: node.id,
      kind: "wave",
      minNextWaveSeconds: node.minNextWaveSeconds,
      maxNextWaveSeconds: node.maxNextWaveSeconds,
      maxDurationSeconds: node.maxDurationSeconds,
      clearOnTimeout: node.clearOnTimeout,
      members: node.members.map((member) => this.buildMember(member)),
    };
    return wave;
  }

  private buildMember(member: WaveMemberSpec): WaveMemberDefinition {
    const def = this.doc.enemyDefs[member.enemyDefId];
    if (!def) {
      // Defensive: an unknown member spawns nothing.
      return {
        key: member.key,
        class: member.class,
        spawn: () => {},
      };
    }
    return {
      key: member.key,
      class: member.class,
      spawnAtSeconds: member.spawnAtSeconds,
      spawn: (ctx: NeutralMobSpawnerContext, params) => {
        const positions = computeSpawnPositions(member, def);
        positions.forEach((pos, k) => {
          const id = ctx.allocateMobId({
            waveId: params.waveId,
            waveMemberIndex: params.memberIndex * 100 + k,
          });
          const mob = new JsonMob(this.doc, def, {
            id,
            waveId: params.waveId,
            spawn: pos,
            scaleHealth: member.scaleHealth,
          });
          ctx.spawnMob(mob);
        });
      },
    };
  }
}

function computeSpawnPositions(member: WaveMemberSpec, def: EnemyDefinition): Vec2[] {
  const base = member.spawn ?? def.spawn ?? { x: 0, y: 0 };
  const count = Math.max(1, member.count ?? 1);
  if (count <= 1) return [base];
  const form: FormationSpec = member.formation ?? { type: "line", spacingX: 48 };
  const offsets: Vec2[] = [];
  const rot = ((form.rotationDegrees ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  const push = (ox: number, oy: number) => {
    offsets.push({ x: ox * cos - oy * sin, y: ox * sin + oy * cos });
  };

  switch (form.type) {
    case "line": {
      const sx = form.spacingX ?? 48;
      for (let i = 0; i < count; i++) push((i - (count - 1) / 2) * sx, 0);
      break;
    }
    case "grid": {
      const cols = Math.max(1, form.columns ?? Math.ceil(Math.sqrt(count)));
      const sx = form.spacingX ?? 48;
      const sy = form.spacingY ?? 48;
      for (let i = 0; i < count; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        push((c - (cols - 1) / 2) * sx, (r - (Math.ceil(count / cols) - 1) / 2) * sy);
      }
      break;
    }
    case "ring":
    case "circle": {
      const radius = form.radius ?? 80;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        push(Math.cos(a) * radius, Math.sin(a) * radius);
      }
      break;
    }
  }
  return offsets.map((o) => ({ x: base.x + o.x, y: base.y + o.y }));
}
