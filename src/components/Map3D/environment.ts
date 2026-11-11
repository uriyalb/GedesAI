import * as THREE from 'three';
import { TERRAIN } from '../../data/terrain.ts';
import { GIS_PARCELS } from '../../data/gisParcels.ts';
import { GIS_GARDENS } from '../../data/gisGardens.ts';
import { GIS_TREES } from '../../data/gisTrees.ts';
import { REAL_HIGHWAYS, REAL_PARKS } from '../../data/realWorldBlock.ts';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundHeight } from '../../utils/terrain.ts';
import { latLngToWorld } from '../../utils/geo.ts';
import { MeshBuilder, P2, distToRing, pointInRing, rgb, ringArea, ringCentroid, rng, shade } from './meshBuilder.ts';
import type { SiteContext } from './buildingModel.ts';

/** Area covered by the terrain grid (scene metres). */
export const EXTENT = {
  x0: TERRAIN.x0,
  x1: TERRAIN.x0 + (TERRAIN.nx - 1) * TERRAIN.cell,
  z0: -(TERRAIN.y0 + (TERRAIN.nz - 1) * TERRAIN.cell),
  z1: -TERRAIN.y0,
};

const unpack = (flat: number[]): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i] / 10, z: flat[i + 1] / 10 });
  return out;
};

interface Indexed {
  ring: P2[];
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Uniform grid over polygons for fast point lookups. */
class RingIndex<T extends Indexed> {
  private cells = new Map<number, number[]>();
  constructor(
    public items: T[],
    private size = 24
  ) {
    items.forEach((it, i) => {
      for (let cx = Math.floor(it.x0 / size); cx <= Math.floor(it.x1 / size); cx++) {
        for (let cz = Math.floor(it.z0 / size); cz <= Math.floor(it.z1 / size); cz++) {
          const k = cx * 100003 + cz;
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k)!.push(i);
        }
      }
    });
  }
  find(x: number, z: number, accept?: (it: T) => boolean): number {
    const list = this.cells.get(Math.floor(x / this.size) * 100003 + Math.floor(z / this.size));
    if (!list) return -1;
    for (const i of list) {
      const it = this.items[i];
      if (x >= it.x0 && x <= it.x1 && z >= it.z0 && z <= it.z1 && (!accept || accept(it)) && pointInRing(x, z, it.ring)) return i;
    }
    return -1;
  }
}

const withBox = <T extends { ring: P2[] }>(o: T): T & Indexed => {
  const xs = o.ring.map((p) => p.x);
  const zs = o.ring.map((p) => p.z);
  return { ...o, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
};

export interface Road {
  pts: P2[];
  type: string;
  name: string;
  width: number;
}

const ROAD_WIDTH: Record<string, number> = { tertiary: 9, residential: 6.2, living_street: 5.5, service: 3.5 };

/**
 * What stands where on the ground: building lots vs. public space (from the land parcels), building
 * footprints, streets (OpenStreetMap centre-lines) and gardens.
 */
export class Site implements SiteContext {
  lots: RingIndex<Indexed & { isLot: boolean }>;
  buildings: RingIndex<Indexed>;
  roads: Road[] = [];
  paths: Road[] = [];
  private commercial: [P2, P2][] = [];

  constructor(buildingRings: P2[][]) {
    this.lots = new RingIndex(
      GIS_PARCELS.map(([flag, flat]) => {
        const ring = unpack(flat);
        if (ringArea(ring) > 0) ring.reverse(); // clockwise: outward normal is (-dz, dx)
        return withBox({ ring, isLot: flag === 1 });
      })
    );
    this.buildings = new RingIndex(buildingRings.map((ring) => withBox({ ring })));
    for (const h of REAL_HIGHWAYS) {
      if (h.points.length < 2) continue;
      const pts = h.points.map((p) => latLngToWorld(p.lat, p.lng));
      const name = h.name.replace(/&quot;/g, '"');
      if (ROAD_WIDTH[h.type]) this.roads.push({ pts, type: h.type, name, width: ROAD_WIDTH[h.type] });
      else this.paths.push({ pts, type: h.type, name, width: h.type === 'pedestrian' ? 4 : 2.2 });
      if (/דיזנגוף|ג'ורג'|ג׳ורג׳/.test(name)) for (let i = 0; i < pts.length - 1; i++) this.commercial.push([pts[i], pts[i + 1]]);
    }
  }

  lotAt(x: number, z: number): number {
    return this.lots.find(x, z, (l) => l.isLot);
  }
  isPublicSpace(x: number, z: number): boolean {
    return this.lotAt(x, z) < 0;
  }
  insideBuilding(x: number, z: number): boolean {
    return this.buildings.find(x, z) >= 0;
  }
  isCommercial(x: number, z: number): boolean {
    for (const [a, b] of this.commercial) {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < 17) return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------------------------

/**
 * Paints the ground of the whole area as seen from the air: asphalt streets, paved sidewalks around the
 * lots, yards, gardens with sandy paths, the Habima plaza, soft shade under trees and around buildings.
 */
export function paintGround(site: Site, size: number): THREE.CanvasTexture {
  const W = EXTENT.x1 - EXTENT.x0;
  const H = EXTENT.z1 - EXTENT.z0;
  const s = size / Math.max(W, H);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * s);
  canvas.height = Math.round(H * s);
  const c = canvas.getContext('2d')!;
  const rand = rng(42);
  const HAZE = '#a9a595';
  c.fillStyle = HAZE;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.save();
  c.scale(s, s);
  c.translate(-EXTENT.x0, -EXTENT.z0);
  c.lineJoin = 'round';
  c.lineCap = 'round';

  const path = (ring: P2[], close = true) => {
    c.beginPath();
    ring.forEach((p, i) => (i ? c.lineTo(p.x, p.z) : c.moveTo(p.x, p.z)));
    if (close) c.closePath();
  };
  const blotches = (ring: P2[], n: number, colors: string[], rMin: number, rMax: number) => {
    const xs = ring.map((p) => p.x);
    const zs = ring.map((p) => p.z);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    c.save();
    path(ring);
    c.clip();
    for (let i = 0; i < n; i++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + rand() * (z1 - z0);
      const r = rMin + rand() * (rMax - rMin);
      const g = c.createRadialGradient(x, z, 0, x, z, r);
      const col = colors[Math.floor(rand() * colors.length)];
      g.addColorStop(0, col);
      g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
      c.fillStyle = g;
      c.fillRect(x - r, z - r, r * 2, r * 2);
    }
    c.restore();
  };

  // 1. public space: streets and squares are parcels too
  const lots = site.lots.items;
  for (const l of lots) {
    if (l.isLot) continue;
    path(l.ring);
    c.fillStyle = '#5f6367';
    c.fill();
    c.strokeStyle = '#5f6367';
    c.lineWidth = 3;
    c.stroke();
  }
  // 2. sidewalks: a paved band around every building lot
  c.strokeStyle = '#b7b0a1';
  c.lineWidth = 6.4;
  for (const l of lots) {
    if (!l.isLot) continue;
    path(l.ring);
    c.stroke();
  }
  // 3. carriageways from the street centre-lines (covers gaps in the parcel map), lane markings
  for (const r of site.roads) {
    path(r.pts, false);
    c.strokeStyle = '#55595d';
    c.lineWidth = r.width;
    c.stroke();
  }
  for (const r of site.roads) {
    if (r.type !== 'tertiary') continue;
    path(r.pts, false);
    c.setLineDash([3, 4.5]);
    c.strokeStyle = 'rgba(235,235,225,0.55)';
    c.lineWidth = 0.22;
    c.stroke();
    c.setLineDash([]);
  }
  // 4. boulevard strips and public gardens
  const SAND = '#c9b88f';
  for (const g of GIS_GARDENS) {
    const ring = unpack(g.p);
    path(ring);
    if (g.t === 'strip') {
      c.fillStyle = '#8f9368';
      c.fill();
      c.save();
      c.clip();
      // the walking path down the middle of the boulevard
      c.strokeStyle = SAND;
      c.lineWidth = 9;
      c.stroke();
      c.restore();
      path(ring);
      c.strokeStyle = '#7a8358';
      c.lineWidth = 2.4;
      c.stroke();
      blotches(ring, 30, ['rgba(70,90,50,0.35)', 'rgba(190,175,135,0.3)'], 3, 8);
    } else {
      c.fillStyle = '#8a9163';
      c.fill();
      blotches(ring, Math.round(Math.abs(ringArea(ring)) / 28), ['rgba(98,120,66,0.6)', 'rgba(196,180,140,0.55)', 'rgba(120,128,82,0.5)', 'rgba(70,92,52,0.45)'], 3, 9);
    }
  }
  for (const p of REAL_PARKS) {
    if (p.name) continue; // named gardens come from the municipal layer above
    const ring = p.polygon.map((q) => latLngToWorld(q.lat, q.lng));
    path(ring);
    c.fillStyle = '#d6c7a2'; // paved squares
    c.fill();
    blotches(ring, 20, ['rgba(225,214,180,0.5)', 'rgba(170,155,120,0.3)'], 3, 8);
  }
  // 5. building lots: yards - planted, paved or bare earth
  lots.forEach((l, i) => {
    if (!l.isLot) return;
    const k = (i * 2654435761) >>> 0;
    path(l.ring);
    c.fillStyle = ['#8c8d70', '#9a9682', '#7f866a', '#a39d88', '#8a8a74'][k % 5];
    c.fill();
    blotches(l.ring, Math.round(Math.abs(ringArea(l.ring)) / 45), ['rgba(86,108,62,0.55)', 'rgba(176,168,148,0.5)', 'rgba(110,100,78,0.4)', 'rgba(70,95,55,0.5)'], 2, 6);
    path(l.ring);
    c.strokeStyle = 'rgba(70,68,58,0.5)';
    c.lineWidth = 0.35;
    c.stroke();
  });
  // 6. footpaths through gardens
  for (const p of site.paths) {
    path(p.pts, false);
    c.strokeStyle = p.type === 'cycleway' ? '#6f7a72' : SAND;
    c.lineWidth = p.width;
    c.stroke();
  }
  // 7. zebra crossings where residential streets meet the main ones
  // (kept simple: a striped band at both ends of each named residential street)
  c.fillStyle = 'rgba(238,238,230,0.8)';
  for (const r of site.roads) {
    if (r.type !== 'residential' || !r.name) continue;
    for (const [a, b] of [
      [r.pts[0], r.pts[1]],
      [r.pts[r.pts.length - 1], r.pts[r.pts.length - 2]],
    ]) {
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const dx = (b.x - a.x) / L;
      const dz = (b.z - a.z) / L;
      c.save();
      c.translate(a.x + dx * 7, a.z + dz * 7);
      c.rotate(Math.atan2(dz, dx));
      for (let v = -r.width / 2 + 0.3; v < r.width / 2 - 0.3; v += 1) c.fillRect(-1.5, v, 3, 0.5);
      c.restore();
    }
  }
  // 8. contact shade around buildings and under tree crowns
  c.save();
  c.shadowColor = 'rgba(20,24,30,0.6)';
  c.shadowBlur = 5 * s;
  c.fillStyle = 'rgba(40,42,44,0.55)';
  for (const b of site.buildings.items) {
    path(b.ring);
    c.fill();
  }
  c.restore();
  for (const [x, z, r] of GIS_TREES) {
    const g = c.createRadialGradient(x, z, 0, x, z, r * 1.25);
    g.addColorStop(0, 'rgba(22,34,20,0.42)');
    g.addColorStop(0.7, 'rgba(22,34,20,0.25)');
    g.addColorStop(1, 'rgba(22,34,20,0)');
    c.fillStyle = g;
    c.fillRect(x - r * 1.3, z - r * 1.3, r * 2.6, r * 2.6);
  }
  c.restore();

  // 9. grain, and a plain frame so the texture's clamped edge continues as open haze
  const speck = Math.round((canvas.width * canvas.height) / 55);
  for (let i = 0; i < speck; i++) {
    c.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    c.fillRect(rand() * canvas.width, rand() * canvas.height, 2, 2);
  }
  const fade = 70 * s;
  const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, HAZE);
    g.addColorStop(1, 'rgba(169,165,149,0)');
    c.fillStyle = g;
    c.fillRect(rx, ry, rw, rh);
  };
  edge(0, 0, 0, fade, 0, 0, canvas.width, fade);
  edge(0, canvas.height, 0, canvas.height - fade, 0, canvas.height - fade, canvas.width, fade);
  edge(0, 0, fade, 0, 0, 0, fade, canvas.height);
  edge(canvas.width, 0, canvas.width - fade, 0, canvas.width - fade, 0, fade, canvas.height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Terrain surface: the elevation grid, extended flat beyond the surveyed area. */
export function buildGround(texture: THREE.Texture): THREE.Mesh {
  const pad = 640;
  const w = EXTENT.x1 - EXTENT.x0 + pad * 2;
  const h = EXTENT.z1 - EXTENT.z0 + pad * 2;
  const geo = new THREE.PlaneGeometry(w, h, Math.round(w / TERRAIN.cell), Math.round(h / TERRAIN.cell));
  geo.rotateX(-Math.PI / 2);
  geo.translate((EXTENT.x0 + EXTENT.x1) / 2, 0, (EXTENT.z0 + EXTENT.z1) / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z));
    uv.setXY(i, (x - EXTENT.x0) / (EXTENT.x1 - EXTENT.x0), 1 - (z - EXTENT.z0) / (EXTENT.z1 - EXTENT.z0));
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 }));
}

// ---------------------------------------------------------------------------------------------
// Garden walls and hedges
// ---------------------------------------------------------------------------------------------

/**
 * Low plastered walls with hedges along the street side of every lot (with a gap at the gate) and thin
 * walls between neighbouring yards - they step with the slope, which is how the topography reads at eye level.
 */
export function buildFences(mb: MeshBuilder, site: Site) {
  const WALLS = [0xe6dfcf, 0xd9d0bd, 0xcfc9bc, 0xe9e5da, 0xc9bda3];
  const HEDGES = [0x3f6634, 0x4a7239, 0x35592f, 0x587a3e];
  site.lots.items.forEach((lot, li) => {
    if (!lot.isLot) return;
    const r = rng(li * 7919 + 13);
    const wallC = rgb(WALLS[Math.floor(r() * WALLS.length)]);
    const hedgeC = rgb(HEDGES[Math.floor(r() * HEDGES.length)]);
    const hedge = r() < 0.6;
    const ring = lot.ring;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 1.5) continue;
      const dx = (b.x - a.x) / L;
      const dz = (b.z - a.z) / L;
      const nx = -dz;
      const nz = dx;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const other = site.lotAt(mx + nx * 1.3, mz + nz * 1.3);
      const street = other < 0;
      if (!street && other < li) continue; // shared boundary: drawn once
      const step = 3.2;
      const nSeg = Math.max(1, Math.round(L / step));
      const seg = L / nSeg;
      const gate = street && L > 7 ? L * (0.35 + r() * 0.3) : -10;
      for (let k = 0; k < nSeg; k++) {
        const u0 = k * seg;
        const u1 = u0 + seg;
        const um = (u0 + u1) / 2;
        if (Math.abs(um - gate) < 1.6) continue;
        const x = a.x + dx * um;
        const z = a.z + dz * um;
        // buildings standing on the lot line (shop fronts) replace the wall
        if (site.insideBuilding(x - nx * 0.8, z - nz * 0.8) || site.insideBuilding(x + nx * 0.5, z + nz * 0.5)) continue;
        const g = Math.max(groundHeight(a.x + dx * u0, a.z + dz * u0), groundHeight(a.x + dx * u1, a.z + dz * u1));
        const gl = Math.min(groundHeight(a.x + dx * u0, a.z + dz * u0), groundHeight(a.x + dx * u1, a.z + dz * u1));
        if (street) {
          mb.box(a.x, a.z, dx, dz, u0, u1, -0.28, 0, gl - 0.4, g + 0.75, shade(wallC, 0.82), { top: wallC });
          if (hedge) mb.box(a.x, a.z, dx, dz, u0, u1, -0.95, -0.28, g + 0.1, g + 1.55 + ((k * 7) % 3) * 0.08, shade(hedgeC, 0.75), { top: hedgeC });
        } else {
          mb.box(a.x, a.z, dx, dz, u0, u1, -0.09, 0.09, gl - 0.4, g + 1.25, shade(wallC, 0.72), { top: shade(wallC, 0.92) });
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Vegetation
// ---------------------------------------------------------------------------------------------

/** Lumpy crown: an icosphere pushed in and out, darker underneath. */
function crownGeometry(detail: number, seed: number, lump: number): THREE.BufferGeometry {
  // merge the icosphere's duplicated vertices so the crown shades smoothly
  const raw = new THREE.IcosahedronGeometry(1, detail);
  raw.deleteAttribute('normal');
  raw.deleteAttribute('uv');
  const g = mergeVertices(raw, 1e-4);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const a = seed * 1.7;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const f =
      1 +
      lump * (Math.sin(x * 4.1 + a) * Math.cos(z * 3.7 - a) + 0.6 * Math.sin(y * 5.3 + a * 2) * Math.cos(x * 6.1 + z * 2.3)) +
      lump * 0.5 * Math.sin((x + y + z) * 9 + a);
    // flatter underside
    const yy = y < 0 ? y * 0.7 : y;
    p.setXYZ(i, x * f, yy * f, z * f);
    const light = 0.5 + 0.6 * Math.max(0, (y + 0.9) / 1.9) + lump * 0.9 * (f - 1);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = Math.min(1.25, light);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Palm crown: arching fronds. */
function palmGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const fronds = 12;
  for (let f = 0; f < fronds; f++) {
    const ang = (f / fronds) * Math.PI * 2 + (f % 2) * 0.2;
    const lift = f % 3 === 0 ? 0.75 : f % 3 === 1 ? 0.35 : 0.05;
    const cx = Math.cos(ang);
    const cz = Math.sin(ang);
    let prev: [number, number, number, number] | null = null;
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const rad = t * 1.0;
      const y = lift * Math.sin(t * Math.PI * 0.6) * 0.9 - t * t * (0.75 - lift * 0.4);
      const w = 0.16 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1));
      const cur: [number, number, number, number] = [cx * rad, y, cz * rad, w];
      if (prev) {
        const quad = [
          [prev[0] - cz * prev[3], prev[1], prev[2] + cx * prev[3]],
          [prev[0] + cz * prev[3], prev[1], prev[2] - cx * prev[3]],
          [cur[0] + cz * cur[3], cur[1], cur[2] - cx * cur[3]],
          [cur[0] - cz * cur[3], cur[1], cur[2] + cx * cur[3]],
        ];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          pos.push(...quad[k]);
          const l = 0.75 + 0.45 * (1 - t);
          col.push(l, l, l);
        }
      }
      prev = cur;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Trees by species group, the way they shape this neighbourhood: boulevard ficus with wide, dense, dark
 * crowns that close over the street; grey-green olives and eucalyptus in the gardens; upright bottle trees;
 * cypresses and palms in the yards. Plus shrubs in the private yards.
 */
export function buildVegetation(site: Site, hq: boolean, shadows: boolean): THREE.Group {
  const group = new THREE.Group();
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x6a5644, roughness: 0.95 });
  const palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });

  const trees = GIS_TREES;
  const nPalm = trees.filter((t) => t[4] === 5).length;
  const nCyp = trees.filter((t) => t[4] === 4).length;
  const nBroad = trees.length - nPalm - nCyp;

  const main = [0, 1].map((i) => new THREE.InstancedMesh(crownGeometry(hq ? 2 : 1, i * 3 + 1, 0.11), leafMat, nBroad));
  const sat = new THREE.InstancedMesh(crownGeometry(1, 5, 0.13), leafMat, nBroad * 3);
  const trunkGeo = new THREE.CylinderGeometry(0.75, 1, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, trees.length);
  const coneGeo = new THREE.ConeGeometry(1, 1, 8, 3);
  coneGeo.translate(0, 0.5, 0);
  {
    const p = coneGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.6 + 0.5 * p.getY(i);
    coneGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const cypress = new THREE.InstancedMesh(coneGeo, leafMat, Math.max(1, nCyp));
  const palms = new THREE.InstancedMesh(palmGeometry(), palmMat, Math.max(1, nPalm));

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const color = new THREE.Color();
  const counts = [0, 0];
  let nSat = 0;
  let nTrunk = 0;
  let iCyp = 0;
  let iPalm = 0;

  // hue, saturation, lightness per species group (crown geometry carries the light/dark modelling)
  const TINT: Record<number, [number, number, number]> = {
    0: [0.27, 0.5, 0.21], // mixed broadleaf
    1: [0.31, 0.55, 0.15], // ficus: dark and glossy
    2: [0.23, 0.25, 0.27], // olive / eucalyptus: grey-green
    3: [0.25, 0.48, 0.23], // bottle tree
  };

  trees.forEach(([x, z, rad, h, sp], i) => {
    const r = rng(i * 9973 + 7);
    const y = groundHeight(x, z);
    const rot = r() * Math.PI * 2;
    q.setFromAxisAngle(up, rot);
    if (sp === 5) {
      const ph = Math.max(7, h);
      m4.compose(p.set(x, y, z), q, sc.set(0.24, ph, 0.24));
      trunks.setMatrixAt(nTrunk++, m4);
      const cs = 2.6 + r() * 1.2;
      m4.compose(p.set(x, y + ph, z), q, sc.set(cs, cs, cs));
      palms.setMatrixAt(iPalm, m4);
      palms.setColorAt(iPalm++, color.setHSL(0.24 + r() * 0.03, 0.45, 0.22 + r() * 0.05));
      return;
    }
    if (sp === 4) {
      const ch = Math.max(7, h + 1);
      m4.compose(p.set(x, y, z), q, sc.set(0.9 + r() * 0.4, ch, 0.9 + r() * 0.4));
      cypress.setMatrixAt(iCyp, m4);
      cypress.setColorAt(iCyp++, color.setHSL(0.32, 0.4, 0.12 + r() * 0.03));
      m4.compose(p.set(x, y, z), q, sc.set(0.18, 1.2, 0.18));
      trunks.setMatrixAt(nTrunk++, m4);
      return;
    }
    const [hue, satu, light] = TINT[sp] ?? TINT[0];
    color.setHSL(hue + (r() - 0.5) * 0.05, satu + (r() - 0.5) * 0.12, light + (r() - 0.5) * 0.08);
    // crown proportions
    const wide = sp === 1 ? 1.18 : sp === 3 ? 0.7 : 1.0;
    const cr = Math.max(1.6, rad * wide);
    const ch = sp === 1 ? Math.max(2.4, Math.min(h * 0.5, cr * 0.75)) : sp === 3 ? Math.max(3, h * 0.55) : Math.max(2.2, Math.min(h * 0.55, cr * 0.95));
    const top = Math.max(h, ch * 1.4 + 2);
    const cy = y + top - ch;
    const tr = sp === 1 ? 0.3 + cr * 0.07 : 0.16 + cr * 0.04;
    m4.compose(p.set(x, y - 0.2, z), q, sc.set(tr, top - ch * 1.3 + 0.2, tr));
    trunks.setMatrixAt(nTrunk++, m4);
    const v = i % 2;
    m4.compose(p.set(x, cy, z), q, sc.set(cr, ch, cr));
    main[v].setMatrixAt(counts[v], m4);
    main[v].setColorAt(counts[v]++, color);
    // smaller masses around the main one break the silhouette
    const nS = sp === 3 ? 1 : sp === 2 ? 3 : 2 + (cr > 4 ? 1 : 0);
    for (let k = 0; k < nS && k < 3; k++) {
      const a = rot + (k / nS) * Math.PI * 2 + r() * 0.8;
      const d = cr * (0.45 + r() * 0.25);
      const s = cr * (0.45 + r() * 0.2);
      q.setFromAxisAngle(up, r() * 6.28);
      m4.compose(p.set(x + Math.cos(a) * d, cy + (r() - 0.35) * ch * 0.5, z + Math.sin(a) * d), q, sc.set(s, s * (sp === 1 ? 0.7 : 0.85), s));
      sat.setMatrixAt(nSat, m4);
      sat.setColorAt(nSat++, color.clone().offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.06));
    }
  });
  main[0].count = counts[0];
  main[1].count = counts[1];
  sat.count = nSat;
  trunks.count = nTrunk;
  cypress.count = iCyp;
  palms.count = iPalm;

  // shrubs and potted green in the yards
  const shrubPos: [number, number, number][] = [];
  site.lots.items.forEach((lot, li) => {
    if (!lot.isLot) return;
    const r = rng(li * 31 + 5);
    const want = Math.min(14, Math.round(Math.abs(ringArea(lot.ring)) / 55));
    for (let k = 0, tries = 0; k < want && tries < 60; tries++) {
      const x = lot.x0 + r() * (lot.x1 - lot.x0);
      const z = lot.z0 + r() * (lot.z1 - lot.z0);
      if (!pointInRing(x, z, lot.ring) || distToRing(x, z, lot.ring) < 1 || site.insideBuilding(x, z)) continue;
      shrubPos.push([x, z, 0.6 + r() * 1.1]);
      k++;
    }
  });
  const shrubs = new THREE.InstancedMesh(crownGeometry(1, 9, 0.15), leafMat, Math.max(1, shrubPos.length));
  shrubPos.forEach(([x, z, s], i) => {
    const r = rng(i * 17 + 3);
    q.setFromAxisAngle(up, r() * 6.28);
    m4.compose(p.set(x, groundHeight(x, z) + s * 0.45, z), q, sc.set(s * (0.9 + r() * 0.5), s * 0.8, s * (0.9 + r() * 0.5)));
    shrubs.setMatrixAt(i, m4);
    // mostly green, the odd bougainvillea
    const b = r();
    shrubs.setColorAt(i, b < 0.06 ? color.setHSL(0.9, 0.55, 0.36) : color.setHSL(0.26 + r() * 0.06, 0.45, 0.16 + r() * 0.08));
  });
  shrubs.count = shrubPos.length;

  for (const mesh of [...main, sat, trunks, cypress, palms, shrubs]) {
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

// ---------------------------------------------------------------------------------------------
// Street life
// ---------------------------------------------------------------------------------------------

/** Parked cars along the kerbs - they give the streets their real scale. */
export function buildCars(site: Site, shadows: boolean): THREE.Group {
  const group = new THREE.Group();
  const spots: { x: number; z: number; ang: number }[] = [];
  site.roads.forEach((road, ri) => {
    if (road.type === 'service') return;
    const r = rng(ri * 101 + 9);
    const off = road.width / 2 - 1.05;
    for (const side of [1, -1]) {
      let carry = 3 + r() * 4;
      for (let i = 0; i < road.pts.length - 1; i++) {
        const a = road.pts[i];
        const b = road.pts[i + 1];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        if (L < 0.5) continue;
        const dx = (b.x - a.x) / L;
        const dz = (b.z - a.z) / L;
        let u = carry;
        for (; u < L; u += 5.4) {
          if (r() > (road.type === 'tertiary' ? 0.4 : 0.72)) continue;
          const x = a.x + dx * u - dz * off * side;
          const z = a.z + dz * u + dx * off * side;
          if (!site.isPublicSpace(x, z) || site.insideBuilding(x, z)) continue;
          spots.push({ x, z, ang: Math.atan2(-dz, dx) + (side < 0 ? Math.PI : 0) });
        }
        carry = u - L;
      }
    }
  });
  const bodyGeo = new THREE.BoxGeometry(4.2, 0.72, 1.75);
  bodyGeo.translate(0, 0.62, 0);
  const cabGeo = new THREE.BoxGeometry(2.3, 0.58, 1.58);
  cabGeo.translate(-0.15, 1.24, 0);
  const paint = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.25, metalness: 0.4 });
  const body = new THREE.InstancedMesh(bodyGeo, paint, Math.max(1, spots.length));
  const cab = new THREE.InstancedMesh(cabGeo, glass, Math.max(1, spots.length));
  const COLORS = [0xf2f2f0, 0xf2f2f0, 0xe9e9e6, 0xc9ccd0, 0xa8adb3, 0x6f757c, 0x33373c, 0x1f2226, 0x8a2f2a, 0x2f4d7a, 0xd9d2c0];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const color = new THREE.Color();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(up, s.ang);
    m4.compose(p.set(s.x, groundHeight(s.x, s.z), s.z), q, one);
    body.setMatrixAt(i, m4);
    cab.setMatrixAt(i, m4);
    body.setColorAt(i, color.setHex(COLORS[Math.abs(i * 7 + Math.floor(s.x)) % COLORS.length]));
  });
  body.count = cab.count = spots.length;
  for (const mesh of [body, cab]) {
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
  return group;
}

/** Shade sail over the playground in the garden at the heart of the block. */
export function buildGardenFeatures(mb: MeshBuilder) {
  const g = GIS_GARDENS.find((x) => x.n.includes('צמח'));
  if (!g) return;
  const c = ringCentroid(unpack(g.p));
  const y = groundHeight(c.x, c.z);
  const sail = rgb(0xbfdcc0);
  const corners: [number, number, number][] = [
    [c.x - 5.5, y + 4.6, c.z - 4.5],
    [c.x + 5.5, y + 3.4, c.z - 5],
    [c.x + 6, y + 4.8, c.z + 4.5],
    [c.x - 5, y + 3.2, c.z + 5],
  ];
  mb.quad(corners[0], corners[1], corners[2], corners[3], shade(sail, 0.75));
  mb.quad(corners[3], corners[2], corners[1], corners[0], sail);
  for (const k of corners) mb.box(k[0], k[2], 1, 0, -0.09, 0.09, -0.09, 0.09, groundHeight(k[0], k[2]) - 0.3, k[1] + 0.2, rgb(0x8d9498));
}

/** Sky: deep Mediterranean blue overhead, pale haze towards the sea horizon. */
export function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#7fb0e2');
  g.addColorStop(0.45, '#aecdea');
  g.addColorStop(0.72, '#d6e4ec');
  g.addColorStop(1, '#e3e9e6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
