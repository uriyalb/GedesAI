import * as THREE from 'three';

export type RGB = [number, number, number];
export type UVRect = [number, number, number, number]; // u0, v0, u1, v1
export interface P2 {
  x: number;
  z: number;
}

/** sRGB hex (0xrrggbb) -> linear RGB triple, optionally scaled. */
export function rgb(hex: number, scale = 1): RGB {
  const c = new THREE.Color(hex);
  return [c.r * scale, c.g * scale, c.b * scale];
}

export function shade(c: RGB, f: number): RGB {
  return [c[0] * f, c[1] * f, c[2] * f];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function ringArea(r: P2[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].z - r[i].x * r[j].z;
  return a / 2;
}

export function ringCentroid(r: P2[]): P2 {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j].x * r[i].z - r[i].x * r[j].z;
    a += f;
    cx += (r[j].x + r[i].x) * f;
    cz += (r[j].z + r[i].z) * f;
  }
  if (Math.abs(a) < 1e-6) return { x: r.reduce((s, p) => s + p.x, 0) / r.length, z: r.reduce((s, p) => s + p.z, 0) / r.length };
  return { x: cx / (3 * a), z: cz / (3 * a) };
}

export function pointInRing(x: number, z: number, r: P2[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].z > z !== r[j].z > z && x < ((r[j].x - r[i].x) * (z - r[i].z)) / (r[j].z - r[i].z) + r[i].x) c = !c;
  }
  return c;
}

/** Distance from a point to the outline of a ring. */
export function distToRing(x: number, z: number, r: P2[]): number {
  let best = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const ax = r[j].x;
    const az = r[j].z;
    const dx = r[i].x - ax;
    const dz = r[i].z - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Accumulates triangles (position, normal, uv, vertex colour) and turns them into one BufferGeometry.
 * Everything in the model is drawn with a single atlas material: plain surfaces point their UVs at a
 * white texel and get their colour from the vertex colour.
 */
export class MeshBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private n = 0;

  constructor(private white: UVRect) {}

  get vertexCount(): number {
    return this.n;
  }

  private vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: RGB): number {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    return this.n++;
  }

  /**
   * Quad a-b-c-d (counter-clockwise seen from the front). UVs: a = (u0,v0), b = (u1,v0), c = (u1,v1), d = (u0,v1).
   * cTop lets the upper edge (c, d) take a different colour (cheap ambient-occlusion gradients).
   */
  quad(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    color: RGB,
    uvr: UVRect = this.white,
    cTop: RGB = color
  ) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, uvr[0], uvr[1], color);
    const i1 = this.vert(b[0], b[1], b[2], nx, ny, nz, uvr[2], uvr[1], color);
    const i2 = this.vert(c[0], c[1], c[2], nx, ny, nz, uvr[2], uvr[3], cTop);
    const i3 = this.vert(d[0], d[1], d[2], nx, ny, nz, uvr[0], uvr[3], cTop);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  /** Vertical wall quad from (ax, az) to (bx, bz); the outward side is on the right when walking a -> b seen from above with z down. */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, color: RGB, uvr?: UVRect, cTop?: RGB) {
    this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], color, uvr, cTop);
  }

  /** Flat polygon at height y (triangulated, with optional holes). */
  polygon(outer: P2[], holes: P2[][], y: number, color: RGB, up = true) {
    const contour = outer.map((p) => new THREE.Vector2(p.x, p.z));
    const hs = holes.map((h) => h.map((p) => new THREE.Vector2(p.x, p.z)));
    let tris: number[][];
    try {
      tris = THREE.ShapeUtils.triangulateShape(contour, hs);
    } catch {
      return;
    }
    const all = [...outer, ...holes.flat()];
    const [u, v] = [(this.white[0] + this.white[2]) / 2, (this.white[1] + this.white[3]) / 2];
    const base = this.n;
    for (const p of all) this.vert(p.x, y, p.z, 0, up ? 1 : -1, 0, u, v, color);
    // In x/z with y up, a counter-clockwise triangle in (x, z) faces down - choose the winding by the actual sign
    for (const t of tris) {
      const a = all[t[0]];
      const b = all[t[1]];
      const c = all[t[2]];
      const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
      const facesUp = cross < 0;
      if (facesUp === up) this.idx.push(base + t[0], base + t[1], base + t[2]);
      else this.idx.push(base + t[0], base + t[2], base + t[1]);
    }
  }

  /**
   * Box on a local frame: origin (ox, oz), unit axis (ux, uz) with length along it from u0 to u1, and the
   * perpendicular axis (-uz, ux) from v0 to v1; vertical extent y0..y1.
   */
  box(ox: number, oz: number, ux: number, uz: number, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: RGB, opts: { top?: RGB; bottom?: boolean } = {}) {
    const px = -uz;
    const pz = ux;
    const P = (u: number, v: number): [number, number] => [ox + ux * u + px * v, oz + uz * u + pz * v];
    const c = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
    // Make sure the corners run so that the side faces point outwards
    const area = (c[1][0] - c[0][0]) * (c[3][1] - c[0][1]) - (c[1][1] - c[0][1]) * (c[3][0] - c[0][0]);
    const ring = area > 0 ? [c[0], c[3], c[2], c[1]] : c;
    for (let i = 0; i < 4; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % 4];
      this.wall(a[0], a[1], b[0], b[1], y0, y1, color);
    }
    const t = opts.top ?? color;
    this.quad([ring[0][0], y1, ring[0][1]], [ring[1][0], y1, ring[1][1]], [ring[2][0], y1, ring[2][1]], [ring[3][0], y1, ring[3][1]], t);
    if (opts.bottom) {
      this.quad([ring[3][0], y0, ring[3][1]], [ring[2][0], y0, ring[2][1]], [ring[1][0], y0, ring[1][1]], [ring[0][0], y0, ring[0][1]], shade(color, 0.6));
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
