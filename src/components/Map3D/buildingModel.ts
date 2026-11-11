import { groundHeight } from '../../utils/terrain.ts';
import { cellUV, type FacadeStyle } from '../../utils/facadeAtlas.ts';
import { MeshBuilder, P2, RGB, distToRing, hashStr, mix, pointInRing, rgb, ringArea, ringCentroid, rng, shade } from './meshBuilder.ts';

/**
 * Procedural building model. Geometry comes from the municipal survey (footprint, roof heights); the
 * facade language comes from what the GIS records about each building - year built, floors, open ground
 * floor on columns, preservation status - translated into the building types of central Tel Aviv:
 *
 *   intl    1930s-40s International Style: smooth cream plaster, horizontal windows, cantilevered balconies
 *           with solid (often rounded) parapets, "thermometer" stair glazing, raised ground floor
 *   post    1950s: plain plaster blocks, long balconies partly closed with shutters, perforated stairwells
 *   block   1960s-80s: apartment blocks on columns with continuous shuttered balconies and exposed slab edges
 *   modern  1990s onwards: white plaster / stone, large glazing, glass balustrades, set-back roof floors
 *   civic   theatre, concert hall, cinema, school
 *   tower   high-rises (Dizengoff Tower / Center)
 *
 * Roofs get what makes the Tel Aviv roofscape: parapets, stair rooms, solar water heaters facing south,
 * air-conditioners, and roof-top additions where the survey shows volume above the main roof.
 */
export interface ModelBuilding {
  id: string;
  /** Parts, each [outer ring, ...holes], in scene metres. */
  parts: P2[][][];
  /** Mean roof height and top of roof structures above the ground (m). */
  roofMean: number;
  top: number;
  floors?: number;
  year?: number;
  pilotis?: boolean;
  kind?: string;
  name?: string;
  preserved?: boolean;
}

export interface SiteContext {
  /** True when the point lies in public space (street, square, garden) rather than on a building lot. */
  isPublicSpace(x: number, z: number): boolean;
  /** True when the point is on a shopping street (shop fronts on the ground floor). */
  isCommercial(x: number, z: number): boolean;
}

export interface BuiltInfo {
  /** Ground level at the building and the top of its roof structures (scene y). */
  ground: number;
  top: number;
  style: string;
}

type Style = FacadeStyle | 'tower' | 'shed';

const PLASTER: Record<string, number[]> = {
  intl: [0xf0eadb, 0xe9dfc6, 0xe2d2b0, 0xf4f1e8, 0xdccfb4, 0xe8d9b8, 0xede6d6],
  post: [0xe5dbc5, 0xd9ccb1, 0xe8e1d0, 0xd6c8a8, 0xdfd6c4, 0xe6d6b6],
  block: [0xd8cfbe, 0xcfc7b8, 0xe0d5c0, 0xcabfab, 0xd9d2c4, 0xdccba9],
  modern: [0xf3f1ec, 0xebe8e1, 0xe5ddcf, 0xf0eee9, 0xdedbd3],
  civic: [0xf2f1ec, 0xe9e4d8, 0xdfd6c2],
  tower: [0xd6d2c6],
  shed: [0xbfbcb4, 0xcfc9ba, 0xa9a69f, 0xd8d3c6],
};
const ROOFS = [0xbdb8ad, 0xc8c3b7, 0xaeaa9f, 0xdcd9d0, 0xb8af9d, 0xc2bcac, 0xa9a59b];
const C_PANEL = rgb(0x2b3a4d);
const C_TANK = rgb(0xecebe6);
const C_AC = rgb(0xb9bab6);
const C_GLASS_RAIL = rgb(0xa9c0cb);
const C_WOOD = rgb(0x9a7b58);
const C_PLANT = rgb(0x4f7a3c);
const C_STONE = rgb(0xb5aea0);
const C_AWNING = [rgb(0x9a3d32), rgb(0x2f5d73), rgb(0xd9c9a0), rgb(0x55693f)];

function styleOf(b: ModelBuilding, area: number): Style {
  const name = b.name ?? '';
  if (b.kind && b.kind !== 'מבנה ציבור') return 'shed';
  if (b.top < 4.3 && area < 90) return 'shed';
  if (b.top > 38) return 'tower';
  if (/בית ספר|גן ילדים/.test(name)) return 'post';
  if (b.kind === 'מבנה ציבור' || /הבימה|היכל|קולנוע|מוזיאון|תיאטרון/.test(name)) return 'civic';
  const y = b.year ?? 0;
  if (!y) return b.pilotis ? 'block' : 'post';
  if (y < 1950) return 'intl';
  if (y < 1965) return 'post';
  if (y < 1990) return 'block';
  return 'modern';
}

function cleanRing(ring: P2[], clockwise: boolean): P2[] {
  const out: P2[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.08) out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].z - out[out.length - 1].z) < 0.08) out.pop();
  // Walls face (-dz, dx): outwards for a ring with negative signed area
  if (ringArea(out) > 0 === clockwise) out.reverse();
  return out;
}

interface FacadeLayout {
  cols: string[]; // bay kind per column for the upper floors ('plain' = blank wall)
  balconies: [number, number][]; // column spans carrying a balcony
  stair: number; // column of the stairwell, -1 if none
}

function layoutFacade(nb: number, role: 'main' | 'front' | 'side', st: Style, r: () => number, noBalcony: boolean): FacadeLayout {
  const cols: string[] = new Array(nb).fill('win');
  const balconies: [number, number][] = [];
  let stair = -1;
  if (st === 'tower') return { cols: cols.fill('tower'), balconies, stair };
  if (st === 'civic') {
    for (let i = 0; i < nb; i++) cols[i] = role !== 'side' && i % 2 === 0 ? 'win' : r() < 0.25 ? 'small' : 'win2';
    return { cols, balconies, stair };
  }
  if (role === 'side' || noBalcony) {
    for (let i = 0; i < nb; i++) {
      const v = r();
      cols[i] = i % 3 === 1 ? 'small' : v < 0.25 ? 'win2' : v < 0.33 && nb > 3 ? 'plain' : 'win';
    }
    if (role === 'side' && nb >= 4 && r() < 0.35) {
      stair = Math.floor(nb / 2);
      cols[stair] = 'stair';
    }
    return { cols, balconies, stair };
  }
  const flip = r() < 0.5;
  const span = (a: number, b: number) => {
    balconies.push([a, b]);
    for (let i = a; i <= b; i++) cols[i] = 'door';
  };
  if (st === 'block') {
    span(0, nb - 1); // continuous balcony across the whole front
  } else if (st === 'post') {
    if (role === 'main' && nb >= 5) {
      stair = Math.floor(nb / 2);
      cols[stair] = 'stair';
      span(0, stair - 1);
      span(stair + 1, nb - 1);
    } else if (nb <= 2) span(0, nb - 1);
    else span(flip ? 1 : 0, flip ? nb - 1 : nb - 2);
  } else if (st === 'modern') {
    if (nb <= 2) span(0, nb - 1);
    else if (nb < 5) span(flip ? nb - 2 : 0, flip ? nb - 1 : 1);
    else {
      span(0, 1);
      span(nb - 2, nb - 1);
    }
    for (let i = 0; i < nb; i++) if (cols[i] === 'win') cols[i] = 'wide';
  } else {
    // International Style: asymmetric compositions - a balcony group against a stair tower or a plain wall
    if (nb === 1) span(0, 0);
    else if (nb === 2) span(flip ? 1 : 0, flip ? 1 : 0);
    else if (nb === 3) {
      if (role === 'main' && r() < 0.5) {
        stair = 1;
        cols[1] = 'stair';
        span(0, 0);
        span(2, 2);
      } else {
        span(flip ? 1 : 0, flip ? 2 : 1);
        cols[flip ? 0 : 2] = 'wide';
      }
    } else if (role === 'main') {
      stair = Math.floor(nb / 2);
      cols[stair] = 'stair';
      const wl = Math.max(1, Math.ceil(stair * 0.7));
      const wr = Math.max(1, Math.ceil((nb - 1 - stair) * 0.7));
      span(0, wl - 1);
      span(nb - wr, nb - 1);
    } else {
      const w = Math.max(1, Math.ceil(nb * 0.55));
      span(flip ? nb - w : 0, flip ? nb - 1 : w - 1);
    }
  }
  return { cols, balconies, stair };
}

/** Adds one building to the mesh builder. */
export function buildBuilding(mb: MeshBuilder, b: ModelBuilding, site: SiteContext, lite = false): BuiltInfo {
  const seed = hashStr(b.id);
  const r = rng(seed);
  const partAreas = b.parts.map((p) => Math.abs(ringArea(p[0])));
  const totalArea = partAreas.reduce((s, a) => s + a, 0);
  const st = styleOf(b, totalArea);
  const name = b.name ?? '';

  // Plaster colour: listed buildings are restored (bright), the rest carry decades of sun and dust
  const pal = PLASTER[st];
  let wall = rgb(pal[Math.floor(r() * pal.length)]);
  const restored = b.preserved || r() < 0.22 || st === 'modern';
  if (b.preserved && st === 'intl') wall = rgb([0xf5f3ec, 0xf1ecdf, 0xf6f4ef][Math.floor(r() * 3)]);
  if (!restored) wall = mix(shade(wall, 0.9 + r() * 0.06), rgb(0xb9ae98), 0.12 + r() * 0.1);
  if (/הבימה/.test(name)) wall = rgb(0xf6f5f1);
  if (/היכל/.test(name)) wall = rgb(0xdccfb6);
  let roofCol = rgb(ROOFS[Math.floor(r() * ROOFS.length)]);
  if (/היכל/.test(name)) roofCol = rgb(0x8f7763);
  const noBalcony = st === 'civic' || st === 'tower' || /בית ספר|גן ילדים/.test(name);

  let ground = 0;
  let topY = 0;
  let gCount = 0;

  b.parts.forEach((part, pi) => {
    const outer = cleanRing(part[0], true);
    if (outer.length < 3) return;
    const holes = part.slice(1).map((h) => cleanRing(h, false)).filter((h) => h.length >= 3);
    const area = Math.abs(ringArea(outer)) - holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0);
    const gs = outer.map((p) => groundHeight(p.x, p.z));
    const gMin = Math.min(...gs);
    const gMax = Math.max(...gs);
    const gAvg = gs.reduce((s, v) => s + v, 0) / gs.length;
    ground += gAvg;
    gCount++;
    const cen = ringCentroid(outer);
    const cenInside = pointInRing(cen.x, cen.z, outer) && !holes.some((h) => pointInRing(cen.x, cen.z, h));

    // ---------- small structures: kiosks, sheds, bus shelters ----------
    if (st === 'shed') {
      const top = gAvg + Math.max(2.2, b.top);
      const c = b.kind === 'תחנת אוטובוס' ? rgb(0x6f777c) : wall;
      for (let i = 0; i < outer.length; i++) {
        const a = outer[i];
        const n = outer[(i + 1) % outer.length];
        mb.wall(a.x, a.z, n.x, n.z, gMin - 0.6, top, shade(c, 0.85), cellUV('plain'), c);
      }
      mb.polygon(outer, [], top, shade(c, 0.9));
      topY = Math.max(topY, top);
      return;
    }

    // ---------- vertical organisation ----------
    const PAR = st === 'tower' ? 0.5 : st === 'modern' ? 1.05 : 0.9;
    let roofRel = Math.min(b.top, b.roofMean + 0.8);
    let extra = b.top - roofRel;
    if (extra < 1.7 || st === 'tower') {
      roofRel = b.top;
      extra = 0;
    }
    const parapetTop = gAvg + roofRel;
    const bodyAll = parapetTop - PAR - (gAvg + (gMax - gAvg) * 0.7);
    const pil = b.pilotis && bodyAll > 7.5 && st !== 'tower' && st !== 'civic' ? 2.7 : 0;
    const plinth = pil ? 0 : st === 'intl' ? 0.9 : st === 'modern' || st === 'tower' || st === 'civic' ? 0.25 : 0.6;
    const floorBase = gAvg + (gMax - gAvg) * 0.7 + (bodyAll > 4 ? plinth : 0.1);
    const resH = parapetTop - PAR - floorBase - pil;
    let n = 0;
    const lo = 2.7;
    const hi = st === 'civic' ? 5.5 : 3.65;
    if (b.floors && st !== 'tower') {
      for (const cand of pil ? [b.floors, b.floors - 1, b.floors + 1] : [b.floors, b.floors + 1, b.floors - 1]) {
        if (cand >= 1 && resH / cand >= lo && resH / cand <= hi) {
          n = cand;
          break;
        }
      }
    }
    if (!n) n = Math.max(1, Math.round(resH / (st === 'tower' ? 3.4 : st === 'civic' ? 4.2 : 3.05)));
    const fh = resH / n;
    const roofSlab = parapetTop - PAR;
    const facade: FacadeStyle = st === 'tower' ? 'civic' : (st as FacadeStyle);
    const bayW = st === 'intl' ? 3.3 : st === 'post' ? 3.4 : st === 'block' ? 3.6 : st === 'modern' ? 3.9 : st === 'tower' ? 3.0 : 4.6;
    const balD = st === 'intl' ? 1.25 : st === 'post' ? 1.3 : st === 'block' ? 1.45 : 1.6;
    const awning = C_AWNING[Math.floor(r() * C_AWNING.length)];

    // ---------- classify edges: street fronts get balconies and the entrance ----------
    const rings = [outer, ...holes];
    const edgeInfo = rings.map((ring, ri) =>
      ring.map((a, i) => {
        const c = ring[(i + 1) % ring.length];
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const L = Math.hypot(dx, dz);
        const nx = -dz / (L || 1);
        const nz = dx / (L || 1);
        const mx = (a.x + c.x) / 2;
        const mz = (a.z + c.z) / 2;
        const front = ri === 0 && L > 2.4 && (site.isPublicSpace(mx + nx * 6, mz + nz * 6) || site.isPublicSpace(mx + nx * 10, mz + nz * 10));
        const commercial = front && site.isCommercial(mx + nx * 7, mz + nz * 7);
        return { a, c, dx: dx / (L || 1), dz: dz / (L || 1), L, nx, nz, front, commercial };
      })
    );
    let mainEdge = -1;
    edgeInfo[0].forEach((e, i) => {
      if (e.front && (mainEdge < 0 || e.L > edgeInfo[0][mainEdge].L)) mainEdge = i;
    });

    // ---------- walls ----------
    const wallLo = shade(wall, 0.84);
    rings.forEach((ring, ri) => {
      edgeInfo[ri].forEach((e, ei) => {
        if (e.L < 0.05) return;
        const role: 'main' | 'front' | 'side' = ri === 0 && ei === mainEdge ? 'main' : e.front ? 'front' : 'side';
        let lay: FacadeLayout;
        let nb: number;
        if (e.L < 1.3) {
          nb = 1;
          lay = { cols: ['plain'], balconies: [], stair: -1 };
        } else if (e.L < 2.5) {
          // short facets: either a rounded corner (ribbon windows wrap around it) or a jog in the wall
          const prev = edgeInfo[ri][(ei + ring.length - 1) % ring.length];
          const next = edgeInfo[ri][(ei + 1) % ring.length];
          const curved = prev.L < 3.2 && next.L < 3.2 && prev.dx * e.dx + prev.dz * e.dz > 0.7 && next.dx * e.dx + next.dz * e.dz > 0.7;
          nb = 1;
          lay = { cols: [st === 'tower' ? 'tower' : curved ? 'wide' : r() < 0.5 ? 'small' : 'plain'], balconies: [], stair: -1 };
        } else {
          nb = Math.max(1, Math.round(e.L / bayW));
          lay = layoutFacade(nb, role, st, r, noBalcony);
        }
        const w = e.L / nb;
        const entryCol = role === 'main' ? (lay.stair >= 0 ? lay.stair : Math.floor(nb / 2)) : -1;

        for (let j = 0; j < nb; j++) {
          const ax = e.a.x + e.dx * w * j;
          const az = e.a.z + e.dz * w * j;
          const bx = e.a.x + e.dx * w * (j + 1);
          const bz = e.a.z + e.dz * w * (j + 1);
          const gLow = Math.min(groundHeight(ax, az), groundHeight(bx, bz)) - 1.2;
          if (!pil) {
            mb.wall(ax, az, bx, bz, gLow, floorBase, shade(wall, 0.74), cellUV('plain'), wallLo);
          }
          for (let k = 0; k < n; k++) {
            const y0 = floorBase + pil + k * fh;
            let kind = lay.cols[j];
            if (k === 0 && !pil) {
              if (j === entryCol) kind = 'entry';
              else if (e.commercial) kind = (j + seed) % 2 ? 'shop' : 'shop2';
              else if (kind === 'door') kind = st === 'modern' ? 'wide' : st === 'civic' ? 'entry' : 'win';
            }
            if (st === 'civic' && k === 0 && e.front) kind = 'entry';
            // top-floor variety: the odd closed shutter
            if (kind === 'win' && r() < 0.22) kind = 'win2';
            const cell = kind === 'plain' || kind === 'tower' || kind === 'shop' || kind === 'shop2' ? kind : `${facade}-${kind}`;
            const cb = k === 0 && !pil ? wallLo : wall;
            mb.wall(ax, az, bx, bz, y0, y0 + fh, cb, cellUV(cell), wall);
          }
          // parapet
          mb.wall(ax, az, bx, bz, roofSlab, parapetTop, wall, cellUV('plain'), shade(wall, 1.04));
          mb.wall(bx, bz, ax, az, roofSlab, parapetTop, shade(wall, 0.72), cellUV('plain'), shade(wall, 0.86));
        }

        // shop awnings along commercial fronts
        if (e.commercial && !pil && !lite) {
          mb.box(e.a.x, e.a.z, e.dx, e.dz, 0.3, e.L - 0.3, 0, 1.1, floorBase + fh * 0.78, floorBase + fh * 0.84, awning, { bottom: true });
        }

        // entrance: steps up to the raised ground floor and a thin canopy
        if (entryCol >= 0 && !pil && st !== 'tower' && !e.commercial) {
          const u0 = w * entryCol + w * 0.2;
          const u1 = w * (entryCol + 1) - w * 0.2;
          const g = groundHeight(e.a.x + e.dx * (u0 + u1) / 2 + e.nx, e.a.z + e.dz * (u0 + u1) / 2 + e.nz);
          if (floorBase - g > 0.25) mb.box(e.a.x, e.a.z, e.dx, e.dz, u0, u1, 0, 1.3, g - 0.3, floorBase, C_STONE);
          if (st !== 'civic') mb.box(e.a.x, e.a.z, e.dx, e.dz, u0 - 0.3, u1 + 0.3, 0, 1.2, floorBase + fh * 0.82, floorBase + fh * 0.82 + 0.12, shade(wall, 1.03), { bottom: true });
        }

        // balconies
        for (const [i0, i1] of lay.balconies) {
          const margin = st === 'block' ? 0.05 : 0.22;
          const u0 = w * i0 + margin;
          const len = w * (i1 - i0 + 1) - margin * 2;
          if (len < 1.5) continue;
          const roundR = st === 'intl' && !lite && (b.year ?? 1940) < 1942 && r() < 0.6 ? Math.min(1.0, balD * 0.8) : 0;
          const roundSide = r() < 0.5;
          for (let k = pil ? 0 : 1; k < n; k++) {
            const y = floorBase + pil + k * fh;
            addBalcony(mb, e.a.x + e.dx * u0, e.a.z + e.dz * u0, e.dx, e.dz, len, balD, y, {
              wall,
              style: st,
              roundL: roundSide ? roundR : 0,
              roundR: roundSide ? 0 : roundR,
              canopyAt: k === n - 1 ? y + fh - 0.12 : 0,
              shutters: st === 'post' ? 0.45 : st === 'block' ? 0.6 : 0,
              bays: i1 - i0 + 1,
              fh,
              r,
            });
          }
        }
      });
    });

    // ---------- open ground floor on columns ----------
    if (pil) {
      const yTop = floorBase + pil;
      mb.polygon(outer, holes, yTop, shade(wall, 0.5), false);
      edgeInfo[0].forEach((e) => {
        if (e.L < 2) return;
        const nc = Math.max(1, Math.round(e.L / 4.2));
        for (let j = 0; j <= nc; j++) {
          const u = Math.min(e.L - 0.25, Math.max(0.25, (e.L * j) / nc));
          const x = e.a.x + e.dx * u - e.nx * 0.35;
          const z = e.a.z + e.dz * u - e.nz * 0.35;
          mb.box(x, z, e.dx, e.dz, -0.19, 0.19, -0.19, 0.19, groundHeight(x, z) - 0.4, yTop, shade(wall, 0.96));
        }
      });
      if (cenInside) {
        // recessed lobby and stair core
        const core = outer.map((p) => ({ x: cen.x + (p.x - cen.x) * 0.5, z: cen.z + (p.z - cen.z) * 0.5 }));
        let longest = 0;
        core.forEach((a, i) => {
          const c = core[(i + 1) % core.length];
          const l = Math.hypot(c.x - a.x, c.z - a.z);
          const c0 = core[(longest + 1) % core.length];
          if (l > Math.hypot(c0.x - core[longest].x, c0.z - core[longest].z)) longest = i;
        });
        core.forEach((a, i) => {
          const c = core[(i + 1) % core.length];
          mb.wall(a.x, a.z, c.x, c.z, gMin - 0.8, yTop, shade(wall, 0.62), cellUV(i === longest ? `${facade}-entry` : 'plain'), shade(wall, 0.55));
        });
      }
    }

    // ---------- roof ----------
    mb.polygon(outer, holes, roofSlab, roofCol);
    topY = Math.max(topY, parapetTop);
    const blocked: { x: number; z: number; rad: number }[] = [];
    const insideRoof = (x: number, z: number, m: number) =>
      pointInRing(x, z, outer) && distToRing(x, z, outer) > m && !holes.some((h) => pointInRing(x, z, h) || distToRing(x, z, h) < m);
    const longE = edgeInfo[0].reduce((best, e) => (e.L > best.L ? e : best), edgeInfo[0][0]);
    const boxFits = (cx: number, cz: number, hu: number, hv: number) =>
      [
        [-hu, -hv],
        [hu, -hv],
        [hu, hv],
        [-hu, hv],
      ].every(([u, v]) => insideRoof(cx + longE.dx * u - longE.dz * v, cz + longE.dz * u + longE.dx * v, 0.5));

    if (st === 'tower') {
      // plant rooms on top of the high-rise
      if (cenInside) mb.box(cen.x, cen.z, longE.dx, longE.dz, -5, 5, -4, 4, roofSlab, roofSlab + 4, shade(wall, 0.9));
    } else if (extra > 0 && cenInside) {
      let base = roofSlab;
      let left = gAvg + b.top - roofSlab;
      // A whole storey above the main roof: set-back roof-top addition
      if (extra >= 4.3 && area > 130 && holes.length === 0) {
        const pent = outer.map((p) => ({ x: cen.x + (p.x - cen.x) * 0.74, z: cen.z + (p.z - cen.z) * 0.74 }));
        const ph = Math.min(3.1, left - 0.6);
        const pc = rgb(0xf1efe9);
        pent.forEach((a, i) => {
          const c = pent[(i + 1) % pent.length];
          const L = Math.hypot(c.x - a.x, c.z - a.z);
          const nb = Math.max(1, Math.round(L / 3.8));
          for (let j = 0; j < nb; j++) {
            const kind = L < 2 ? 'plain' : j % 2 ? 'modern-wide' : 'modern-door';
            mb.wall(a.x + ((c.x - a.x) * j) / nb, a.z + ((c.z - a.z) * j) / nb, a.x + ((c.x - a.x) * (j + 1)) / nb, a.z + ((c.z - a.z) * (j + 1)) / nb, base, base + ph, pc, cellUV(kind));
          }
        });
        mb.polygon(pent, [], base + ph, rgb(0xd6d2c8));
        // glass balustrade of the roof terrace is implied by the parapet; mark the terrace deck
        base += ph;
        left -= ph;
        blocked.push({ x: cen.x, z: cen.z, rad: Math.sqrt(area / Math.PI) * 0.74 });
        topY = Math.max(topY, base);
      }
      if (left >= 1.2) {
        // stair room (and often a second roof room next to it)
        const hu = Math.min(2.7, Math.sqrt(area) * 0.2);
        const hv = Math.min(1.7, Math.sqrt(area) * 0.14);
        const h = Math.min(left, 3.0);
        const tries: [number, number][] = [
          [0, 0],
          [hu * 1.2, 0],
          [-hu * 1.2, 0],
          [0, hv * 1.5],
          [0, -hv * 1.5],
        ];
        for (const [du, dv] of tries) {
          const cx = cen.x + longE.dx * du - longE.dz * dv;
          const cz = cen.z + longE.dz * du + longE.dx * dv;
          if (base > roofSlab || boxFits(cx, cz, hu, hv)) {
            mb.box(cx, cz, longE.dx, longE.dz, -hu, hu, -hv, hv, base, base + h, shade(wall, 0.97), { top: shade(roofCol, 0.92) });
            blocked.push({ x: cx, z: cz, rad: Math.hypot(hu, hv) });
            topY = Math.max(topY, base + h);
            break;
          }
        }
        if (base === roofSlab && area > 230 && extra >= 2.2 && r() < 0.6) {
          const side = r() < 0.5 ? 1 : -1;
          const off = Math.sqrt(area) * 0.3 * side;
          const cx = cen.x + longE.dx * off;
          const cz = cen.z + longE.dz * off;
          if (boxFits(cx, cz, 2.6, 2.2)) {
            mb.box(cx, cz, longE.dx, longE.dz, -2.6, 2.6, -2.2, 2.2, base, base + 2.6, shade(wall, 1.0), { top: shade(roofCol, 0.95) });
            blocked.push({ x: cx, z: cz, rad: 3.4 });
          }
        }
      }
    }

    // ---------- roofscape ----------
    if (st !== 'tower' && area > 45) {
      const free = (x: number, z: number, m: number) => insideRoof(x, z, m) && !blocked.some((q) => Math.hypot(q.x - x, q.z - z) < q.rad + 0.8);
      const xs = outer.map((p) => p.x);
      const zs = outer.map((p) => p.z);
      const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];

      // patched waterproofing: lighter and darker fields
      if (!lite) {
        for (let i = 0; i < 3; i++) {
          const cx = x0 + r() * (x1 - x0);
          const cz = z0 + r() * (z1 - z0);
          const hu = 1.5 + r() * 3;
          const hv = 1.2 + r() * 2.2;
          if (boxFits(cx, cz, hu, hv) && free(cx, cz, 0.5)) {
            const c = shade(roofCol, r() < 0.5 ? 1.1 : 0.9);
            const P = (u: number, v: number): [number, number, number] => [cx + longE.dx * u - longE.dz * v, roofSlab + 0.03, cz + longE.dz * u + longE.dx * v];
            mb.quad(P(-hu, hv), P(hu, hv), P(hu, -hv), P(-hu, -hv), c);
            mb.quad(P(-hu, -hv), P(hu, -hv), P(hu, hv), P(-hu, hv), c);
          }
        }
      }

      if (st !== 'civic') {
        // solar water heaters - one per flat, collectors tilted to the south, lined up in rows
        const want = Math.max(1, Math.min(lite ? 7 : 12, Math.round((n * area) / 130)));
        const cand: [number, number][] = [];
        const ox = r() * 2.4;
        const oz = r() * 3.4;
        for (let z = z0 + oz; z < z1; z += 3.4) for (let x = x0 + ox; x < x1; x += 2.3) if (free(x, z, 1.5) && free(x, z - 1.1, 0.6) && free(x, z + 1.0, 0.6)) cand.push([x, z]);
        const start = cand.length > want ? Math.floor(r() * (cand.length - want)) : 0;
        for (const [x, z] of cand.slice(start, start + want)) {
          const y = roofSlab;
          mb.quad([x - 0.45, y + 0.15, z + 0.7], [x + 0.45, y + 0.15, z + 0.7], [x + 0.45, y + 0.95, z - 0.4], [x - 0.45, y + 0.95, z - 0.4], C_PANEL);
          mb.quad([x + 0.45, y + 0.15, z + 0.7], [x - 0.45, y + 0.15, z + 0.7], [x - 0.45, y + 0.95, z - 0.4], [x + 0.45, y + 0.95, z - 0.4], shade(C_AC, 0.7));
          mb.box(x, z - 0.62, 1, 0, -0.5, 0.5, -0.22, 0.22, y + 0.85, y + 1.3, C_TANK);
          blocked.push({ x, z, rad: 0.6 });
        }
        // air-conditioner condensers near the parapet
        const acs = lite ? 2 : 3 + Math.floor(r() * n * 1.5);
        for (let i = 0, tries = 0; i < acs && tries < 60; tries++) {
          const x = x0 + r() * (x1 - x0);
          const z = z0 + r() * (z1 - z0);
          if (!free(x, z, 0.55) || distToRing(x, z, outer) > 2.2) continue;
          mb.box(x, z, longE.dx, longE.dz, -0.45, 0.45, -0.2, 0.2, roofSlab, roofSlab + 0.65, C_AC);
          i++;
        }
      }
      // roof terraces: pergola, deck and planters on new and renovated buildings
      if (!lite && (st === 'modern' || (restored && r() < 0.35)) && area > 120) {
        for (let tries = 0; tries < 12; tries++) {
          const cx = x0 + r() * (x1 - x0);
          const cz = z0 + r() * (z1 - z0);
          if (!boxFits(cx, cz, 2.6, 2.1) || !free(cx, cz, 2.2)) continue;
          const y = roofSlab;
          mb.box(cx, cz, longE.dx, longE.dz, -2.4, 2.4, -1.9, 1.9, y, y + 0.06, C_WOOD);
          for (const [u, v] of [
            [-2.2, -1.7],
            [2.2, -1.7],
            [2.2, 1.7],
            [-2.2, 1.7],
          ]) {
            mb.box(cx + longE.dx * u - longE.dz * v, cz + longE.dz * u + longE.dx * v, longE.dx, longE.dz, -0.07, 0.07, -0.07, 0.07, y, y + 2.4, C_WOOD);
          }
          for (let s = -2.2; s <= 2.2; s += 0.55) mb.box(cx + longE.dx * s, cz + longE.dz * s, longE.dx, longE.dz, -0.06, 0.06, -1.9, 1.9, y + 2.4, y + 2.5, C_WOOD, { bottom: true });
          mb.box(cx - longE.dz * 2.3, cz + longE.dx * 2.3, longE.dx, longE.dz, -2.4, 2.4, -0.3, 0.3, y, y + 0.9, C_PLANT, { top: shade(C_PLANT, 1.2) });
          break;
        }
      }
    }
    void pi;
  });

  return { ground: gCount ? ground / gCount : 0, top: topY, style: st };
}

interface BalconyOpts {
  wall: RGB;
  style: Style;
  roundL: number;
  roundR: number;
  canopyAt: number;
  shutters: number;
  bays: number;
  fh: number;
  r: () => number;
}

/**
 * Cantilevered balcony: slab, solid parapet (glass on new buildings), optionally rounded at one end as on the
 * 1930s buildings, optionally closed with shutter panels as on later ones.
 * (ox, oz) is the left end on the wall, (ux, uz) runs along the wall, the balcony projects to (-uz, ux).
 */
function addBalcony(mb: MeshBuilder, ox: number, oz: number, ux: number, uz: number, len: number, d: number, y: number, o: BalconyOpts) {
  const P = (u: number, v: number): P2 => ({ x: ox + ux * u - uz * v, z: oz + uz * u + ux * v });
  // outline from the wall, around the front, back to the wall
  const pts: [number, number][] = [[0, 0]];
  const arc = (cu: number, cv: number, rad: number, a0: number, a1: number) => {
    for (let i = 0; i <= 5; i++) {
      const a = a0 + ((a1 - a0) * i) / 5;
      pts.push([cu + Math.cos(a) * rad, cv + Math.sin(a) * rad]);
    }
  };
  if (o.roundL > 0) arc(o.roundL, d - o.roundL, o.roundL, Math.PI, Math.PI / 2);
  else pts.push([0, d]);
  if (o.roundR > 0) arc(len - o.roundR, d - o.roundR, o.roundR, Math.PI / 2, 0);
  else pts.push([len, d]);
  pts.push([len, 0]);
  const ring = pts.map(([u, v]) => P(u, v));

  const slab = shade(o.wall, 1.02);
  const under = shade(o.wall, 0.58);
  const glass = o.style === 'modern';
  const par = glass ? C_GLASS_RAIL : shade(o.wall, 1.03);
  const parIn = glass ? shade(C_GLASS_RAIL, 0.85) : shade(o.wall, 0.7);
  const ph = glass ? 1.05 : 0.95;
  const slabs = (yy: number, t: number) => {
    // The outline runs clockwise seen from above (wall -> front -> wall), like the footprint rings
    mb.polygon(ring, [], yy, slab, true);
    mb.polygon(ring, [], yy - t, under, false);
    for (let i = 0; i < ring.length - 1; i++) mb.wall(ring[i].x, ring[i].z, ring[i + 1].x, ring[i + 1].z, yy - t, yy, slab);
  };
  slabs(y + 0.02, 0.16);
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    mb.wall(a.x, a.z, b.x, b.z, y, y + ph, par, undefined, glass ? shade(par, 1.1) : par);
    mb.wall(b.x, b.z, a.x, a.z, y, y + ph, parIn);
  }
  if (o.canopyAt) slabs(o.canopyAt, 0.1);

  // shutter panels closing parts of the balcony (very common since the 1950s)
  if (o.shutters > 0) {
    const w = len / o.bays;
    for (let j = 0; j < o.bays; j++) {
      if (o.r() > o.shutters) continue;
      const a = P(j * w + 0.03, d);
      const b = P((j + 1) * w - 0.03, d);
      const yTop = y + o.fh - 0.14;
      // seen from the street the panel runs right-to-left along the front edge
      mb.wall(a.x, a.z, b.x, b.z, y + ph, yTop, shade(o.wall, 0.98), cellUV('shutter'));
      mb.wall(b.x, b.z, a.x, a.z, y + ph, yTop, shade(o.wall, 0.5));
    }
  }
}
