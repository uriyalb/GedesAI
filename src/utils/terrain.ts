import { TERRAIN } from '../data/terrain.ts';

/**
 * Ground height (m, relative to the scene origin) at scene coordinates (x, z),
 * bilinearly interpolated from the municipal-GIS elevation grid. Clamped at the grid edges.
 */
export function groundHeight(x: number, z: number): number {
  const { x0, y0, cell, nx, nz, h } = TERRAIN;
  const fx = Math.min(Math.max((x - x0) / cell, 0), nx - 1.001);
  const fy = Math.min(Math.max((-z - y0) / cell, 0), nz - 1.001);
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const at = (ii: number, jj: number) => h[jj * nx + ii];
  return (
    at(i, j) * (1 - tx) * (1 - ty) +
    at(i + 1, j) * tx * (1 - ty) +
    at(i, j + 1) * (1 - tx) * ty +
    at(i + 1, j + 1) * tx * ty
  );
}

/** Absolute elevation above sea level of scene height y. */
export function toSeaLevel(y: number): number {
  return y + TERRAIN.ref;
}
