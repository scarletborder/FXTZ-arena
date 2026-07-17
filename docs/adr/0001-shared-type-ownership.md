# ADR 0001: Shared Type Ownership

## Status

Accepted.

## Context

Cross-package data contracts had accumulated in `@repo/content`, `@repo/raid-logic`, and application folders. Some contracts duplicated definitions already present in `@repo/types`, while others were re-exported through implementation packages. This made the authoritative definition difficult to identify and allowed same-named types to drift.

## Decision

`@repo/types` owns serializable data, identifiers, content metadata, protocol messages, and runtime state shapes used by more than one package or application.

Implementation packages may temporarily re-export migrated types for compatibility, but their own code and new consumers should import shared contracts from `@repo/types`.

Types remain with their owning module when they describe implementation behavior rather than shared data. Examples include `RaidLogicRuntime`, physics adapters, AI strategies, Phaser presentation models, repositories, and transport implementations. Test fixtures and file-local helper shapes also remain local.

When identical names describe different data, the narrower contract receives a qualifying name. The legacy deterministic snapshot therefore uses `LegacyProjectileState` and `LegacyEffectState`, while the current battle runtime owns the canonical `ProjectileState` and `EffectState` names.

## Consequences

- Shared contracts have one authoritative import path.
- `@repo/types` cannot depend on `@repo/content` or `@repo/raid-logic`.
- Content and logic packages expose behavior while consuming shared contracts.
- New cross-package types must be added to `packages/types/src` and exported through its domain barrels.
