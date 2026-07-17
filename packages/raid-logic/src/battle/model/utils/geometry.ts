import { fp } from "@shaisrc/fixed-point";

import type { ProjectileState } from "@repo/types";

export function hitsBeam(beam: ProjectileState, x: number, y: number): boolean {
  const fpDx = fp.sub(fp.fromFloat(x), fp.fromFloat(beam.x));
  const fpDy = fp.sub(fp.fromFloat(y), fp.fromFloat(beam.y));
  const fpAngle = fp.fromFloat(beam.angle);
  const fpCos = fp.cos(fpAngle);
  const fpSin = fp.sin(fpAngle);

  const fpForward = fp.add(fp.mul(fpDx, fpCos), fp.mul(fpDy, fpSin));
  const fpSide = fp.abs(
    fp.add(fp.mul(fp.negate(fpDx), fpSin), fp.mul(fpDy, fpCos)),
  );

  if (!Number.isFinite(beam.width)) {
    return (
      fp.gte(fpForward, fp.fromInt(0)) &&
      fp.lte(fpSide, fp.div(fp.fromFloat(beam.height), fp.fromInt(2)))
    );
  }
  return (
    fp.lte(
      fp.abs(fpForward),
      fp.div(fp.fromFloat(beam.width), fp.fromInt(2)),
    ) && fp.lte(fpSide, fp.div(fp.fromFloat(beam.height), fp.fromInt(2)))
  );
}
