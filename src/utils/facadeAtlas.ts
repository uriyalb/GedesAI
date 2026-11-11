import * as THREE from 'three';
import type { UVRect } from '../components/Map3D/meshBuilder.ts';

/**
 * Facade atlas: one texture holding a "bay x storey" tile for every kind of opening in every architectural
 * period of the block. Walls are white in the atlas and get their plaster colour from the mesh's vertex colours,
 * so one material draws every building.
 *
 * A tile is roughly 3.4 m wide and one storey (~3.1 m) high.
 */
export type FacadeStyle = 'intl' | 'post' | 'block' | 'modern' | 'civic';
export type BayKind = 'win' | 'win2' | 'door' | 'small' | 'stair' | 'entry' | 'wide';

const STYLES: FacadeStyle[] = ['intl', 'post', 'block', 'modern', 'civic'];
const KINDS: BayKind[] = ['win', 'win2', 'door', 'small', 'stair', 'entry', 'wide'];
const EXTRA = ['white', 'plain', 'shop', 'shop2', 'tower', 'garage', 'shutter', 'glassrail', 'curtain'] as const;
export type ExtraCell = (typeof EXTRA)[number];

const COLS = 8;
const ROWS = 8;
const cellIndex = new Map<string, number>();
EXTRA.forEach((n, i) => cellIndex.set(n, i));
STYLES.forEach((s, si) => KINDS.forEach((k, ki) => cellIndex.set(`${s}-${k}`, EXTRA.length + si * KINDS.length + ki)));

/** UV rectangle of a tile (slightly inset so neighbouring tiles don't bleed in). */
export function cellUV(name: string): UVRect {
  const i = cellIndex.get(name) ?? 1;
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  const e = 0.0016;
  return [c / COLS + e, 1 - (r + 1) / ROWS + e, (c + 1) / COLS - e, 1 - r / ROWS - e];
}

/** A point in the middle of the pure-white tile, for surfaces coloured only by vertex colour. */
export function whiteUV(): UVRect {
  const [u0, v0, u1, v1] = cellUV('white');
  const u = (u0 + u1) / 2;
  const v = (v0 + v1) / 2;
  return [u, v, u, v];
}

let atlas: THREE.CanvasTexture | null = null;

export function getFacadeAtlas(size = 2048): THREE.CanvasTexture {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const S = size / COLS; // tile size in px
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Deterministic noise so the texture is identical on every load
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  const draw = (name: string, fn: (g: Painter) => void) => {
    const i = cellIndex.get(name)!;
    const x = (i % COLS) * S;
    const y = Math.floor(i / COLS) * S;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, S, S);
    ctx.clip();
    ctx.translate(x, y);
    ctx.scale(S / 100, S / 100); // paint in a 100 x 100 unit square; y grows downwards (0 = ceiling, 100 = floor)
    fn(new Painter(ctx, rnd));
    ctx.restore();
  };

  // --- generic tiles ---
  draw('plain', (g) => g.plaster(0.05));
  draw('shutter', (g) => {
    g.rect(0, 0, 100, 100, '#d9d6cc');
    g.slats(0, 0, 100, 100, 3.2, 'rgba(60,60,55,0.35)');
  });
  draw('glassrail', (g) => {
    g.rect(0, 0, 100, 100, '#b9cdd6');
    g.grad(0, 0, 100, 100, 'rgba(255,255,255,0.45)', 'rgba(90,120,135,0.25)');
    g.rect(0, 0, 100, 5, '#8d979c');
  });
  draw('shop', (g) => {
    g.plaster(0.04);
    g.rect(0, 0, 100, 16, '#e8e2d4'); // sign band
    g.rect(8, 4, 84, 8, '#3c4a57');
    g.glass(5, 24, 90, 70);
    g.rect(49, 24, 2, 70, '#2a2f33');
    g.rect(5, 16, 90, 9, '#9a3d32'); // awning
    g.slatsV(5, 16, 90, 9, 7, 'rgba(255,255,255,0.35)');
    g.shadow(5, 25, 90, 10);
    g.rect(0, 94, 100, 6, '#8d8a84');
  });
  draw('shop2', (g) => {
    g.plaster(0.04);
    g.rect(0, 0, 100, 16, '#e6e0d2');
    g.rect(10, 4, 80, 8, '#6a7f4f');
    g.glass(6, 22, 54, 72);
    g.glass(66, 22, 28, 72);
    g.rect(6, 15, 88, 8, '#2f5d73');
    g.shadow(6, 23, 88, 10);
    g.rect(0, 94, 100, 6, '#8d8a84');
  });
  draw('garage', (g) => {
    g.plaster(0.05);
    g.rect(10, 22, 80, 78, '#2d2f31');
    g.grad(10, 22, 80, 78, 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.25)');
  });
  draw('tower', (g) => {
    g.rect(0, 0, 100, 100, '#c9c6bd');
    g.glass(0, 14, 100, 56, true);
    for (let x = 0; x <= 100; x += 25) g.rect(x - 0.8, 14, 1.6, 56, '#6f7478');
    g.rect(0, 70, 100, 30, '#d8d4c8');
    g.rect(0, 0, 100, 14, '#d8d4c8');
    g.shadow(0, 14, 100, 6);
  });
  draw('curtain', (g) => {
    g.glass(0, 0, 100, 100, true);
    for (let x = 0; x <= 100; x += 20) g.rect(x - 0.7, 0, 1.4, 100, '#586068');
    g.rect(0, 46, 100, 2, '#586068');
    g.rect(0, 96, 100, 4, '#586068');
  });

  // --- International Style / "Bauhaus" (1930s-40s): smooth plaster, horizontal windows with thin steel frames,
  // slim concrete ledges, vertical "thermometer" stair glazing ---
  draw('intl-win', (g) => {
    g.plaster(0.04);
    g.ledge(22, 30, 56);
    g.glass(24, 32, 52, 36);
    g.mullionsV(24, 32, 52, 36, 3, '#ecebe6', 1.6);
    g.rect(24, 49, 52, 1.4, '#ecebe6');
    g.sill(22, 68, 56);
  });
  draw('intl-win2', (g) => {
    g.plaster(0.04);
    g.ledge(22, 30, 56);
    g.glass(24, 32, 52, 36);
    g.rect(24, 32, 26, 36, '#c9cfc4'); // one wooden shutter leaf closed
    g.slats(24, 32, 26, 36, 2.6, 'rgba(70,80,70,0.4)');
    g.mullionsV(50, 32, 26, 36, 2, '#ecebe6', 1.6);
    g.sill(22, 68, 56);
  });
  draw('intl-door', (g) => {
    g.plaster(0.03);
    g.glass(14, 26, 30, 74); // balcony door
    g.mullionsV(14, 26, 30, 74, 2, '#ecebe6', 1.8);
    g.rect(14, 44, 30, 1.6, '#ecebe6');
    g.glass(52, 30, 34, 36);
    g.mullionsV(52, 30, 34, 36, 2, '#ecebe6', 1.6);
    g.sill(50, 66, 38);
    g.shadow(0, 0, 100, 34, 0.42); // shade of the balcony above
    g.shadow(0, 86, 100, 14, 0.2, true);
  });
  draw('intl-small', (g) => {
    g.plaster(0.05);
    g.glass(40, 30, 20, 20);
    g.rect(49.3, 30, 1.4, 20, '#ecebe6');
    g.sill(38, 50, 24);
    g.stain(50, 52, 10, 40);
  });
  draw('intl-stair', (g) => {
    g.plaster(0.03);
    g.rect(31, 0, 4, 100, '#f1efe8'); // concrete fins framing the glazing
    g.rect(65, 0, 4, 100, '#f1efe8');
    g.shadow(35, 0, 3, 100, 0.25);
    g.glass(36, 0, 28, 100, true);
    for (let y = 6; y < 100; y += 12.5) g.rect(36, y, 28, 1.3, '#e6e4dc');
    g.rect(49.4, 0, 1.2, 100, '#e6e4dc');
  });
  draw('intl-entry', (g) => {
    g.plaster(0.04);
    g.rect(20, 14, 60, 7, '#f3f1ea'); // entrance canopy
    g.shadow(20, 21, 60, 12, 0.5);
    g.rect(27, 24, 46, 76, '#23282c');
    g.glass(30, 27, 40, 73);
    g.rect(49, 27, 2, 73, '#3a3f43');
    g.rect(30, 44, 40, 1.6, '#3a3f43');
  });
  draw('intl-wide', (g) => {
    g.plaster(0.04);
    g.ledge(4, 30, 92);
    g.glass(6, 32, 88, 34);
    g.mullionsV(6, 32, 88, 34, 5, '#ecebe6', 1.5);
    g.sill(4, 66, 92);
  });

  // --- 1950s: plaster, simple openings with roller shutters, perforated-block stairwells ---
  draw('post-win', (g) => {
    g.plaster(0.06);
    g.rect(26, 26, 48, 6, '#deded6'); // shutter box
    g.glass(27, 32, 46, 36);
    g.rect(27, 32, 46, 14, '#d6d2c4');
    g.slats(27, 32, 46, 14, 2.4, 'rgba(60,60,50,0.4)');
    g.rect(49.2, 46, 1.6, 22, '#dcdcd6');
    g.sill(25, 68, 50);
    g.stain(30, 71, 8, 24);
  });
  draw('post-win2', (g) => {
    g.plaster(0.06);
    g.rect(26, 26, 48, 6, '#deded6');
    g.rect(27, 32, 46, 36, '#d6d2c4'); // shutter fully down
    g.slats(27, 32, 46, 36, 2.4, 'rgba(60,60,50,0.4)');
    g.sill(25, 68, 50);
    g.stain(66, 71, 7, 22);
  });
  draw('post-door', (g) => {
    g.plaster(0.05);
    g.glass(10, 26, 80, 74);
    g.rect(10, 26, 80, 22, '#d2cec0');
    g.slats(10, 26, 80, 22, 2.6, 'rgba(60,60,50,0.4)');
    g.mullionsV(10, 48, 80, 52, 4, '#cfcfc8', 1.6);
    g.shadow(0, 0, 100, 36, 0.45);
    g.shadow(0, 84, 100, 16, 0.2, true);
  });
  draw('post-small', (g) => {
    g.plaster(0.07);
    g.glass(38, 28, 24, 24);
    g.slats(38, 28, 24, 24, 4, 'rgba(230,230,225,0.75)'); // glass louvres
    g.sill(36, 52, 28);
    g.rect(70, 34, 12, 9, '#c8c8c2'); // air-conditioner
    g.shadow(70, 43, 12, 3, 0.35);
    g.stain(74, 46, 6, 34);
  });
  draw('post-stair', (g) => {
    g.plaster(0.05);
    g.rect(32, 0, 36, 100, '#e7e3d8');
    for (let y = 3; y < 100; y += 8) for (let x = 35; x < 66; x += 8) g.rect(x, y, 5, 5, '#3a4046');
  });
  draw('post-entry', (g) => {
    g.plaster(0.06);
    g.rect(16, 16, 68, 6, '#e9e6dc');
    g.shadow(16, 22, 68, 12, 0.5);
    g.rect(26, 26, 48, 74, '#262a2d');
    g.glass(29, 29, 42, 71);
    g.mullionsV(29, 29, 42, 71, 2, '#4a4f52', 2);
  });
  draw('post-wide', (g) => {
    g.plaster(0.06);
    g.rect(8, 26, 84, 6, '#deded6');
    g.glass(9, 32, 82, 36);
    g.rect(9, 32, 40, 20, '#d6d2c4');
    g.slats(9, 32, 40, 20, 2.4, 'rgba(60,60,50,0.4)');
    g.mullionsV(9, 32, 82, 36, 4, '#dcdcd6', 1.5);
    g.sill(7, 68, 86);
  });

  // --- 1960s-80s apartment blocks on columns: exposed slab edges, aluminium windows, bands of plastic shutters ---
  draw('block-win', (g) => {
    g.plaster(0.08);
    g.rect(0, 0, 100, 5, '#bdb9ae'); // exposed slab edge
    g.glass(22, 30, 56, 38);
    g.rect(22, 30, 56, 16, '#cfc9b6');
    g.slats(22, 30, 56, 16, 2.2, 'rgba(50,50,40,0.4)');
    g.rect(49, 46, 2, 22, '#aeb3b6');
    g.sill(20, 68, 60);
    g.stain(24, 71, 9, 26);
  });
  draw('block-win2', (g) => {
    g.plaster(0.08);
    g.rect(0, 0, 100, 5, '#bdb9ae');
    g.rect(22, 30, 56, 38, '#cfc9b6');
    g.slats(22, 30, 56, 38, 2.2, 'rgba(50,50,40,0.4)');
    g.sill(20, 68, 60);
    g.rect(80, 52, 13, 10, '#c4c4be');
    g.shadow(80, 62, 13, 3, 0.35);
  });
  draw('block-door', (g) => {
    g.plaster(0.06);
    g.rect(0, 0, 100, 5, '#bdb9ae');
    g.glass(4, 22, 92, 78);
    g.rect(4, 22, 60, 78, '#cdc7b4'); // sliding shutters partly closed
    g.slats(4, 22, 60, 78, 2.4, 'rgba(50,50,40,0.38)');
    g.rect(34, 22, 1.5, 78, '#a9a594');
    g.mullionsV(64, 22, 32, 78, 2, '#aeb3b6', 1.8);
    g.shadow(0, 5, 100, 30, 0.42);
  });
  draw('block-small', (g) => {
    g.plaster(0.09);
    g.rect(0, 0, 100, 5, '#bdb9ae');
    g.glass(36, 30, 28, 22);
    g.slats(36, 30, 28, 22, 3.6, 'rgba(225,225,220,0.7)');
    g.sill(34, 52, 32);
    g.rect(12, 20, 3, 80, '#b4b0a6'); // drain pipe
    g.stain(46, 55, 9, 38);
  });
  draw('block-stair', (g) => {
    g.plaster(0.07);
    g.rect(0, 0, 100, 5, '#bdb9ae');
    g.rect(30, 5, 40, 95, '#d6d1c4');
    for (let y = 9; y < 100; y += 7) g.rect(33, y, 34, 3.4, '#383d42');
  });
  draw('block-entry', (g) => {
    g.plaster(0.07);
    g.rect(18, 20, 64, 80, '#24282b');
    g.glass(21, 23, 58, 77);
    g.mullionsV(21, 23, 58, 77, 3, '#9aa0a4', 1.8);
    g.shadow(18, 20, 64, 14, 0.4);
  });
  draw('block-wide', (g) => {
    g.plaster(0.08);
    g.rect(0, 0, 100, 5, '#bdb9ae');
    g.glass(6, 30, 88, 38);
    g.rect(6, 30, 50, 38, '#cfc9b6');
    g.slats(6, 30, 50, 38, 2.2, 'rgba(50,50,40,0.4)');
    g.mullionsV(56, 30, 38, 38, 2, '#aeb3b6', 1.6);
    g.sill(4, 68, 92);
  });

  // --- 1990s onwards: large glazing, dark slim frames, crisp white plaster or stone ---
  draw('modern-win', (g) => {
    g.plaster(0.02);
    g.glass(20, 22, 60, 60);
    g.frame(20, 22, 60, 60, '#3a3f44', 1.6);
    g.rect(49.2, 22, 1.6, 60, '#3a3f44');
  });
  draw('modern-win2', (g) => {
    g.plaster(0.02);
    g.glass(20, 22, 60, 60);
    g.rect(20, 22, 60, 28, '#b9bcbb'); // external blind
    g.slats(20, 22, 60, 28, 2, 'rgba(40,40,40,0.3)');
    g.frame(20, 22, 60, 60, '#3a3f44', 1.6);
  });
  draw('modern-door', (g) => {
    g.plaster(0.02);
    g.glass(6, 16, 88, 84);
    g.frame(6, 16, 88, 84, '#353a3f', 1.8);
    g.mullionsV(6, 16, 88, 84, 3, '#353a3f', 1.6);
    g.shadow(0, 0, 100, 34, 0.4);
  });
  draw('modern-small', (g) => {
    g.plaster(0.02);
    g.glass(40, 24, 20, 46);
    g.frame(40, 24, 20, 46, '#3a3f44', 1.5);
  });
  draw('modern-stair', (g) => {
    g.plaster(0.02);
    g.glass(34, 0, 32, 100, true);
    g.rect(34, 0, 1.6, 100, '#3a3f44');
    g.rect(64.4, 0, 1.6, 100, '#3a3f44');
    for (let y = 0; y < 100; y += 25) g.rect(34, y, 32, 1.4, '#3a3f44');
  });
  draw('modern-entry', (g) => {
    g.plaster(0.02);
    g.rect(12, 12, 76, 88, '#1f2326');
    g.glass(15, 15, 70, 85);
    g.mullionsV(15, 15, 70, 85, 3, '#4b5156', 1.8);
    g.shadow(12, 12, 76, 14, 0.4);
  });
  draw('modern-wide', (g) => {
    g.plaster(0.02);
    g.glass(4, 22, 92, 60);
    g.frame(4, 22, 92, 60, '#3a3f44', 1.6);
    g.mullionsV(4, 22, 92, 60, 4, '#3a3f44', 1.4);
  });

  // --- public buildings (theatre, concert hall, school, cinema): large plain panels, tall glazing ---
  draw('civic-win', (g) => {
    g.plaster(0.02);
    g.joints();
    g.glass(30, 20, 40, 64);
    g.frame(30, 20, 40, 64, '#70777c', 1.6);
    g.rect(30, 50, 40, 1.6, '#70777c');
  });
  draw('civic-win2', (g) => {
    g.plaster(0.02);
    g.joints();
  });
  draw('civic-door', (g) => {
    g.plaster(0.02);
    g.glass(0, 8, 100, 92, true);
    for (let x = 0; x <= 100; x += 25) g.rect(x - 0.8, 8, 1.6, 92, '#5c646a');
    g.rect(0, 50, 100, 1.6, '#5c646a');
  });
  draw('civic-small', (g) => {
    g.plaster(0.02);
    g.joints();
    g.glass(20, 40, 60, 10);
  });
  draw('civic-stair', (g) => {
    g.plaster(0.02);
    g.glass(40, 0, 20, 100, true);
  });
  draw('civic-entry', (g) => {
    g.plaster(0.02);
    g.glass(4, 10, 92, 90, true);
    for (let x = 4; x <= 96; x += 23) g.rect(x - 0.8, 10, 1.6, 90, '#4b5156');
    g.shadow(0, 10, 100, 14, 0.4);
  });
  draw('civic-wide', (g) => {
    g.plaster(0.02);
    g.joints();
    g.glass(4, 26, 92, 30);
    g.mullionsV(4, 26, 92, 30, 6, '#70777c', 1.2);
  });

  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  return atlas;
}

/** Drawing helpers working in the 100 x 100 tile space. */
class Painter {
  constructor(
    private c: CanvasRenderingContext2D,
    private rnd: () => number
  ) {}

  rect(x: number, y: number, w: number, h: number, fill: string) {
    this.c.fillStyle = fill;
    this.c.fillRect(x, y, w, h);
  }

  grad(x: number, y: number, w: number, h: number, top: string, bottom: string) {
    const g = this.c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    this.c.fillStyle = g;
    this.c.fillRect(x, y, w, h);
  }

  /** Plaster: white with faint blotches and rain streaks (strength 0..0.1). */
  plaster(strength: number) {
    this.rect(0, 0, 100, 100, '#ffffff');
    for (let i = 0; i < 26; i++) {
      const x = this.rnd() * 100;
      const y = this.rnd() * 100;
      const r = 6 + this.rnd() * 16;
      const g = this.c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(70,60,40,${strength * (0.4 + this.rnd() * 0.6)})`);
      g.addColorStop(1, 'rgba(70,60,40,0)');
      this.c.fillStyle = g;
      this.c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 10; i++) {
      this.rect(this.rnd() * 100, 0, 0.6 + this.rnd(), 100, `rgba(60,55,40,${strength * 0.5})`);
    }
  }

  /** Glass with a sky reflection; `flat` for curtain walls without a frame. */
  glass(x: number, y: number, w: number, h: number, flat = false) {
    const g = this.c.createLinearGradient(x, y, x + w * 0.35, y + h);
    g.addColorStop(0, '#6f8ea3');
    g.addColorStop(0.45, '#33475a');
    g.addColorStop(1, '#1d2933');
    this.c.fillStyle = g;
    this.c.fillRect(x, y, w, h);
    if (!flat) {
      this.shadow(x, y, w, Math.min(8, h * 0.3), 0.45); // reveal: the glass sits back from the wall face
      this.c.fillStyle = 'rgba(0,0,0,0.28)';
      this.c.fillRect(x, y, Math.min(2.2, w * 0.1), h);
    }
  }

  shadow(x: number, y: number, w: number, h: number, alpha = 0.35, up = false) {
    const g = this.c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(up ? 1 : 0, `rgba(20,25,35,${alpha})`);
    g.addColorStop(up ? 0 : 1, 'rgba(20,25,35,0)');
    this.c.fillStyle = g;
    this.c.fillRect(x, y, w, h);
  }

  slats(x: number, y: number, w: number, h: number, step: number, color: string) {
    this.c.fillStyle = color;
    for (let yy = y + step * 0.6; yy < y + h; yy += step) this.c.fillRect(x, yy, w, step * 0.28);
  }

  slatsV(x: number, y: number, w: number, h: number, step: number, color: string) {
    this.c.fillStyle = color;
    for (let xx = x; xx < x + w; xx += step * 2) this.c.fillRect(xx, y, step, h);
  }

  mullionsV(x: number, y: number, w: number, h: number, panes: number, color: string, t: number) {
    this.c.fillStyle = color;
    for (let i = 1; i < panes; i++) this.c.fillRect(x + (w * i) / panes - t / 2, y, t, h);
    this.frame(x, y, w, h, color, t);
  }

  frame(x: number, y: number, w: number, h: number, color: string, t: number) {
    this.c.fillStyle = color;
    this.c.fillRect(x, y, w, t);
    this.c.fillRect(x, y + h - t, w, t);
    this.c.fillRect(x, y, t, h);
    this.c.fillRect(x + w - t, y, t, h);
  }

  /** Thin concrete ledge above an opening, with its shadow. */
  ledge(x: number, y: number, w: number) {
    this.rect(x, y, w, 2.2, '#f6f5f0');
    this.shadow(x, y + 2.2, w, 5, 0.4);
  }

  sill(x: number, y: number, w: number) {
    this.rect(x, y, w, 2.4, '#efede6');
    this.shadow(x, y + 2.4, w, 4, 0.28);
  }

  /** Dirt streak running down from a sill or an air-conditioner. */
  stain(x: number, y: number, w: number, h: number) {
    const g = this.c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(70,62,45,0.16)');
    g.addColorStop(1, 'rgba(70,62,45,0)');
    this.c.fillStyle = g;
    this.c.fillRect(x - w / 2, y, w, h);
  }

  /** Panel joints of stone / precast cladding. */
  joints() {
    this.c.fillStyle = 'rgba(80,80,80,0.14)';
    this.c.fillRect(0, 49.6, 100, 0.8);
    this.c.fillRect(49.6, 0, 0.8, 100);
    this.c.fillRect(0, 99.4, 100, 0.6);
    this.c.fillRect(99.4, 0, 0.6, 100);
  }
}
