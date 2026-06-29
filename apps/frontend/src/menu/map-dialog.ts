import Phaser from "phaser";
import { getAvailableCombatMaps } from "@repo/content";
import { t } from "@repo/i18n";
import type { MapId } from "@repo/types";

import { createFightButton, drawAngledPanel } from "./ui";
import { contentName, type CpuLoadoutPresetId } from "./shared";

interface CpuLoadoutOption {
  readonly id: CpuLoadoutPresetId;
  readonly label: string;
}

interface DropdownOption<TId extends string> {
  readonly id: TId;
  readonly name: string;
}

export function showMapDialog(
  scene: Phaser.Scene,
  currentContainer: Phaser.GameObjects.Container | null,
  onContainerChange: (container: Phaser.GameObjects.Container | null) => void,
  onSelect: (mapId: MapId, cpuLoadoutPresetId?: CpuLoadoutPresetId) => void,
  options: {
    readonly confirmLabel?: string;
    readonly accent?: number;
    readonly showCpuLoadout?: boolean;
  } = {},
): void {
  currentContainer?.destroy();
  const maps = getAvailableCombatMaps().map((map) => ({
    id: map.id,
    name: contentName(map),
  }));
  let selectedMapId: MapId = maps[0]?.id ?? "hakurei_shrine";
  const cpuLoadouts = cpuLoadoutOptions();
  let selectedCpuLoadoutId: CpuLoadoutPresetId = cpuLoadouts[0]!.id;
  const c = scene.add.container(0, 0);
  onContainerChange(c);
  c.add(scene.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6).setInteractive());
  const bg = scene.add.graphics();
  const accent = options.accent ?? 0xe33d44;
  const panelHeight = options.showCpuLoadout ? 330 : 264;
  drawAngledPanel(bg, 430, 238, 420, panelHeight, 0x111821, accent, 0.98);
  c.add(bg);
  c.add(scene.add.text(640, 282, t("battle_start.select_map"), { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "24px", fontStyle: "700", color: "#ffcf6e" }).setOrigin(0.5));
  const dropdown = createMapDropdown(scene, 510, 330, 260, maps, selectedMapId, (mapId) => {
    selectedMapId = mapId;
  });
  c.add(dropdown.container);
  if (options.showCpuLoadout) {
    c.add(scene.add.text(510, 398, t("battle_start.ai_loadout"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#f6f1e6",
    }));
    const cpuDropdown = createCpuLoadoutDropdown(scene, 510, 426, 260, cpuLoadouts, selectedCpuLoadoutId, (presetId) => {
      selectedCpuLoadoutId = presetId;
    });
    c.add(cpuDropdown.container);
  }
  const buttonY = options.showCpuLoadout ? 510 : 452;
  c.add(createFightButton(scene, 560, buttonY, 140, 42, t("battle_start.cancel"), () => {
    c.destroy();
    onContainerChange(null);
  }, { accent: 0x5c7185 }).container);
  c.add(createFightButton(scene, 720, buttonY, 140, 42, options.confirmLabel ?? t("select.confirm_battle"), () => {
    c.destroy();
    onContainerChange(null);
    onSelect(selectedMapId, options.showCpuLoadout ? selectedCpuLoadoutId : undefined);
  }, { accent }).container);
}

export function createMapDropdown<TId extends string = MapId>(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  maps: readonly DropdownOption<TId>[],
  initialMapId: TId,
  onChange: (mapId: TId) => void,
): { readonly container: Phaser.GameObjects.Container } {
  const height = 42;
  const optionHeight = 38;
  const maxOptionsHeight = 152;
  const optionsHeight = Math.min(maxOptionsHeight, maps.length * optionHeight);
  const maxScroll = Math.max(0, maps.length * optionHeight - optionsHeight);
  let selectedMapId = initialMapId;
  let open = false;
  let scrollOffset = 0;
  let draggingPointerId: number | undefined;
  let lastDragY = 0;
  let dragDistance = 0;
  const container = scene.add.container(x, y);
  const background = scene.add.graphics();
  const label = scene.add.text(14, height / 2, mapName(maps, selectedMapId), {
    fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
    fontSize: "17px",
    fontStyle: "700",
    color: "#f6f1e6",
  }).setOrigin(0, 0.5);
  const arrow = scene.add.text(width - 24, height / 2, "v", {
    fontFamily: "Arial",
    fontSize: "18px",
    fontStyle: "700",
    color: "#ffcf6e",
  }).setOrigin(0.5);
  const optionsLayer = scene.add.container(0, height + 6).setVisible(false).setDepth(10000);
  const optionsContent = scene.add.container(0, 0);
  const redrawOptions: Array<() => void> = [];
  const hitArea = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true });

  const redrawMask = () => {
    const worldPosition = optionsLayer.getWorldTransformMatrix().transformPoint(0, 0);
    maskShape.clear();
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRect(worldPosition.x, worldPosition.y, width, optionsHeight);
  };

  const redraw = () => {
    background.clear();
    background.fillStyle(open ? 0x202a38 : 0x151b26, 0.98);
    background.fillRect(0, 0, width, height);
    background.lineStyle(2, open ? 0xffcf6e : 0x5c7185, 1);
    background.strokeRect(0, 0, width, height);
    arrow.setText(open ? "^" : "v");
    optionsLayer.setVisible(open);
    container.setDepth(open ? 10000 : 0);
    if (open) redrawMask();
    bringContainerChainToTop(container);
  };

  const setScrollOffset = (nextOffset: number) => {
    scrollOffset = Phaser.Math.Clamp(nextOffset, 0, maxScroll);
    optionsContent.y = -scrollOffset;
  };

  const beginDrag = (pointer: Phaser.Input.Pointer) => {
    if (!open || maxScroll <= 0) return;
    draggingPointerId = pointer.id;
    lastDragY = pointer.y;
    dragDistance = 0;
  };

  const moveDrag = (pointer: Phaser.Input.Pointer) => {
    if (!open || draggingPointerId !== pointer.id || !pointer.isDown) return;
    const deltaY = lastDragY - pointer.y;
    dragDistance += Math.abs(deltaY);
    setScrollOffset(scrollOffset + deltaY);
    lastDragY = pointer.y;
    pointer.event?.preventDefault();
  };

  const endDrag = (pointer: Phaser.Input.Pointer) => {
    if (draggingPointerId === pointer.id) draggingPointerId = undefined;
  };

  maps.forEach((map, index) => {
    const option = scene.add.container(0, index * optionHeight);
    const optionBg = scene.add.graphics();
    const optionText = scene.add.text(14, optionHeight / 2, map.name, {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#f6f1e6",
    }).setOrigin(0, 0.5);
    const optionHit = scene.add.rectangle(0, 0, width, optionHeight, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    const drawOption = (hovered = false) => {
      optionBg.clear();
      optionBg.fillStyle(hovered ? 0x263244 : 0x101820, 0.98);
      optionBg.fillRect(0, 0, width, optionHeight);
      optionBg.lineStyle(1, map.id === selectedMapId ? 0xffcf6e : 0x34475c, 0.95);
      optionBg.strokeRect(0, 0, width, optionHeight);
      optionText.setColor(map.id === selectedMapId ? "#ffcf6e" : "#f6f1e6");
    };
    redrawOptions.push(() => drawOption(false));
    optionHit.on("pointerdown", (pointer: Phaser.Input.Pointer) => beginDrag(pointer));
    optionHit.on("pointerover", () => drawOption(true));
    optionHit.on("pointerout", () => drawOption(false));
    optionHit.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (dragDistance > 6) {
        endDrag(pointer);
        return;
      }
      selectedMapId = map.id;
      label.setText(map.name);
      open = false;
      onChange(map.id);
      redrawOptions.forEach((redrawOption) => redrawOption());
      redraw();
    });
    option.add([optionBg, optionText, optionHit]);
    optionsContent.add(option);
    drawOption(false);
  });

  const maskShape = scene.make.graphics({ x: 0, y: 0 });
  redrawMask();
  optionsContent.enableFilters();
  optionsContent.filters?.internal.addMask(maskShape);
  const viewportHitArea = scene.add.rectangle(0, 0, width, optionsHeight, 0xffffff, 0.001)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true });
  optionsLayer.add([viewportHitArea, optionsContent]);

  hitArea.on("pointerup", () => {
    open = !open;
    redraw();
  });

  const onWheel = (
    pointer: Phaser.Input.Pointer,
    _gameObjects: unknown,
    _deltaX: number,
    deltaY: number,
  ) => {
    const localPoint = container.getWorldTransformMatrix().applyInverse(pointer.x, pointer.y);
    const bounds = new Phaser.Geom.Rectangle(0, height + 6, width, optionsHeight);
    if (open && Phaser.Geom.Rectangle.Contains(bounds, localPoint.x, localPoint.y)) {
      setScrollOffset(scrollOffset + deltaY);
    }
  };
  scene.input.on("wheel", onWheel);
  viewportHitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => beginDrag(pointer));
  scene.input.on("pointermove", moveDrag);
  scene.input.on("pointerup", endDrag);
  scene.input.on("pointerupoutside", endDrag);

  container.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.input.off("wheel", onWheel);
    scene.input.off("pointermove", moveDrag);
    scene.input.off("pointerup", endDrag);
    scene.input.off("pointerupoutside", endDrag);
    maskShape.destroy();
  });
  container.add([background, label, arrow, hitArea, optionsLayer]);
  redraw();
  return { container };
}

function bringContainerChainToTop(container: Phaser.GameObjects.Container): void {
  let current: Phaser.GameObjects.Container = container;
  while (current.parentContainer) {
    const parent = current.parentContainer;
    parent.bringToTop(current);
    current = parent;
  }
}

function mapName<TId extends string>(
  maps: readonly DropdownOption<TId>[],
  mapId: TId,
): string {
  return maps.find((map) => map.id === mapId)?.name ?? mapId;
}

function cpuLoadoutOptions(): readonly CpuLoadoutOption[] {
  return [
    { id: "marisa_solo", label: t("battle_start.cpu_loadout.marisa_solo") },
    { id: "sakuya_cirno", label: t("battle_start.cpu_loadout.sakuya_cirno") },
    { id: "kaguya_reisen", label: t("battle_start.cpu_loadout.kaguya_reisen") },
  ];
}

function createCpuLoadoutDropdown(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  loadouts: readonly CpuLoadoutOption[],
  initialLoadoutId: CpuLoadoutPresetId,
  onChange: (presetId: CpuLoadoutPresetId) => void,
): { readonly container: Phaser.GameObjects.Container } {
  const dropdownOptions = loadouts.map((loadout) => ({
    id: loadout.id,
    name: loadout.label,
  }));
  return createMapDropdown(
    scene,
    x,
    y,
    width,
    dropdownOptions,
    initialLoadoutId,
    onChange,
  );
}
