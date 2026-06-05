import Phaser from "phaser";

import type { YoumuSlashArcSegment } from "../types";

export interface YoumuSlashArcGroup {
  readonly key: string;
  readonly segments: YoumuSlashArcSegment[];
}

export function drawYoumuSlashArc(
  graphics: Phaser.GameObjects.Graphics,
  segments: readonly YoumuSlashArcSegment[],
): void {
  const sorted = [...segments].sort(
    (left, right) => left.segmentIndex - right.segmentIndex,
  );
  const centers = sorted.map((segment) => ({
    x: segment.display.x,
    y: segment.display.y,
  }));
  const first = centers[0];
  const last = centers[centers.length - 1];
  if (!first || !last) {
    graphics.clear();
    return;
  }

  const innerPoints = centers.map((point) => ({ x: point.x, y: point.y }));

  // 1. 向两侧延伸 5 像素
  const points = extendPolyline(innerPoints, 5);
  if (points.length < 2) {
    graphics.clear();
    return;
  }

  const gold = 0xf6c85f;
  const white = 0xffffff;

  graphics.clear();

  // 2. 计算每个顶点的平滑法线向量
  const normals: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i]!;
    let dx = 0;
    let dy = 0;
    if (i === 0) {
      const next = points[1]!;
      dx = next.x - current.x;
      dy = next.y - current.y;
    } else if (i === points.length - 1) {
      const prev = points[points.length - 2]!;
      dx = current.x - prev.x;
      dy = current.y - prev.y;
    } else {
      const prev = points[i - 1]!;
      const next = points[i + 1]!;
      dx = next.x - prev.x;
      dy = next.y - prev.y;
    }
    const length = Math.hypot(dx, dy) || 1;
    normals.push({
      x: -dy / length,
      y: dx / length,
    });
  }

  // 3. 构建渐变网格的三个顶点序列（外边缘、中心、内边缘）
  const outerPoints: { x: number; y: number }[] = [];
  const centerPoints: { x: number; y: number }[] = [];
  const innerPointsPath: { x: number; y: number }[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const n = normals[i]!;

    // 计算平滑两端收口（Taper），使剑气两端自然变细呈尖角状
    const edgeDist = Math.min(i, points.length - 1 - i);
    const taperLength = Math.max(1, Math.min(4, (points.length - 1) / 2));
    const taper = Math.sin((Math.min(taperLength, edgeDist) / taperLength) * Math.PI / 2);

    // 外延 6 像素，内延 4 像素，并乘上 taper 收口系数
    const extOut = 6 * taper;
    const extIn = 4 * taper;

    outerPoints.push({
      x: p.x + n.x * extOut,
      y: p.y + n.y * extOut,
    });
    centerPoints.push({
      x: p.x,
      y: p.y,
    });
    innerPointsPath.push({
      x: p.x - n.x * extIn,
      y: p.y - n.y * extIn,
    });
  }

  // 4. 绘制连贯的渐变剑气网格
  // 采用 WebGL 的 fillGradientStyle，从中心白色向边缘金色（且不透明度逐渐归零）进行插值
  for (let i = 0; i < points.length - 1; i++) {
    const o0 = outerPoints[i]!;
    const c0 = centerPoints[i]!;
    const i0 = innerPointsPath[i]!;

    const o1 = outerPoints[i + 1]!;
    const c1 = centerPoints[i + 1]!;
    const i1 = innerPointsPath[i + 1]!;

    // --- 外侧带（中心白色 1.0 -> 外边缘金色 0.0） ---
    // 三角形 1: [o0, c0, o1] (对应的顶点属性：o0[金, 0] -> c0[白, 1] -> o1[金, 0])
    graphics.fillGradientStyle(gold, white, gold, gold, 0, 1, 0, 0);
    graphics.fillTriangle(o0.x, o0.y, c0.x, c0.y, o1.x, o1.y);

    // 三角形 2: [c0, c1, o1] (对应的顶点属性：c0[白, 1] -> c1[白, 1] -> o1[金, 0])
    graphics.fillGradientStyle(white, white, gold, gold, 1, 1, 0, 0);
    graphics.fillTriangle(c0.x, c0.y, c1.x, c1.y, o1.x, o1.y);

    // --- 内侧带（中心白色 1.0 -> 内边缘金色 0.0） ---
    // 三角形 3: [c0, i0, c1] (对应的顶点属性：c0[白, 1] -> i0[金, 0] -> c1[白, 1])
    graphics.fillGradientStyle(white, gold, white, white, 1, 0, 1, 1);
    graphics.fillTriangle(c0.x, c0.y, i0.x, i0.y, c1.x, c1.y);

    // 三角形 4: [i0, i1, c1] (对应的顶点属性：i0[金, 0] -> i1[金, 0] -> c1[白, 1])
    graphics.fillGradientStyle(gold, gold, white, white, 0, 0, 1, 1);
    graphics.fillTriangle(i0.x, i0.y, i1.x, i1.y, c1.x, c1.y);
  }

  // 5. 绘制判定白色核心实线（仅在未延伸的 innerPoints 上，使其完美被包裹在发光剑气内部）
  if (innerPoints.length >= 2) {
    graphics.lineStyle(1.5, white, 0.95);
    graphics.beginPath();
    graphics.moveTo(innerPoints[0]!.x, innerPoints[0]!.y);
    for (let i = 1; i < innerPoints.length; i++) {
      graphics.lineTo(innerPoints[i]!.x, innerPoints[i]!.y);
    }
    graphics.strokePath();
  }
}

function extendPolyline(
  points: readonly { readonly x: number; readonly y: number }[],
  capLength: number,
): readonly { readonly x: number; readonly y: number }[] {
  if (points.length < 2) {
    return points;
  }
  const first = points[0]!;
  const second = points[1]!;
  const before = extendPoint(first, second, capLength);
  const last = points[points.length - 1]!;
  const previous = points[points.length - 2]!;
  const after = extendPoint(last, previous, capLength);
  return [before, ...points, after];
}

function extendPoint(
  from: { readonly x: number; readonly y: number },
  toward: { readonly x: number; readonly y: number },
  distance: number,
): { readonly x: number; readonly y: number } {
  const dx = from.x - toward.x;
  const dy = from.y - toward.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: from.x + (dx / length) * distance,
    y: from.y + (dy / length) * distance,
  };
}