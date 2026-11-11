import { BuildingAddress, BuildingPlot } from '../types/index.ts';
import { GIS_BUILDINGS, LEGACY_BUILDING_IDS } from './gisBuildings.ts';

export interface StreetInfo {
  /** Display name in Hebrew. */
  he: string;
  en: string;
  /** Extra spellings used to recognise the street in file / folder names. */
  aliases: string[];
}

/** Streets of the block, keyed by their municipal GIS name. */
export const STREETS: Record<string, StreetInfo> = {
  'חיסין': { he: 'חיסין', en: 'Chissin', aliases: ['chissin', 'hissin', 'chisin', 'hisin', 'hassin', 'chissin st'] },
  'בן ציון': { he: 'שדרות בן ציון', en: 'Ben Zion Blvd', aliases: ['בן ציון', 'בנציון', 'ben zion', 'ben tsiyon', 'ben tzion', 'benzion'] },
  'תרס"ט': { he: 'שדרות תרס"ט', en: 'Tarsat Blvd', aliases: ['תרסט', 'tarsat', 'tarsa"t'] },
  'דיזנגוף': { he: 'דיזנגוף', en: 'Dizengoff', aliases: ['dizengoff', 'dizengof', 'דיזנגוב'] },
  "המלך ג'ורג'": { he: "המלך ג'ורג'", en: 'King George', aliases: ["קינג ג'ורג'", 'king george', 'hamelech george', 'ha-melekh george', 'המלך גורג'] },
  'לוין שמריהו': { he: 'שמריהו לוין', en: 'Shmaryahu Levin', aliases: ['שמריהו לוין', 'levin', 'lewin', 'shmaryahu levin'] },
  'ספיר אליהו': { he: 'אליהו ספיר', en: 'Eliyahu Sapir', aliases: ['אליהו ספיר', 'sapir', 'saphyr'] },
  'שפירא צבי הרמן': { he: 'צבי הרמן שפירא', en: 'Zvi Hermann Shapira', aliases: ['צבי הרמן שפירא', 'הרמן שפירא', 'shapira', 'shapiro'] },
  'ח"ן': { he: 'שדרות ח"ן', en: 'Hen Blvd', aliases: ['חן', 'hen blvd', 'chen blvd'] },
  'הבימה': { he: 'כיכר הבימה', en: 'Habima Square', aliases: ['habima'] },
  'הנביאים': { he: 'הנביאים', en: "HaNevi'im", aliases: ['hanevi\'im', 'haneviim'] },
  'לב אברהם': { he: 'לב אברהם', en: 'Lev Avraham', aliases: ['lev avraham'] },
  "מלצ'ט": { he: "מלצ'ט", en: 'Melchett', aliases: ['melchett', 'melchet', 'מלצט'] },
  'מיכ"ל': { he: 'מיכ"ל', en: 'Mikhal', aliases: ['מיכל', 'mikhal', 'michal'] },
  'חיות פרץ': { he: 'פרץ חיות', en: 'Peretz Hayot', aliases: ['פרץ חיות', 'hayot', 'hayes'] },
  'ורבורג': { he: 'ורבורג', en: 'Warburg', aliases: ['warburg', 'werburg'] },
  'אחד העם': { he: 'אחד העם', en: "Ahad Ha'am", aliases: ["ahad ha'am", 'ahad haam'] },
};

export function streetDisplayHe(gisStreet: string): string {
  return STREETS[gisStreet]?.he ?? gisStreet;
}

export function streetDisplayEn(gisStreet: string): string {
  return STREETS[gisStreet]?.en ?? gisStreet;
}

export function formatAddressHe(a: Pick<BuildingAddress, 'streetHe' | 'number' | 'entrance'>): string {
  return `${a.streetHe} ${a.number}${a.entrance}`;
}

export function formatAddressEn(a: Pick<BuildingAddress, 'streetEn' | 'number' | 'entrance'>): string {
  return `${a.number}${a.entrance} ${a.streetEn}`;
}

const KIND_EN: Record<string, string> = {
  'מבנה ארעי': 'Temporary structure',
  'מבנה ציבור': 'Public building',
  'תחנת אוטובוס': 'Bus stop',
  'מבנה בבנייה': 'Under construction',
};

/** Area-weighted centroid of a polygon ring given as [lat, lng] pairs. */
function ringCentroid(ring: [number, number][]): { lat: number; lng: number; area: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [y0, x0] = ring[j];
    const [y1, x1] = ring[i];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-14) {
    const n = ring.length;
    return { lat: ring.reduce((s, p) => s + p[0], 0) / n, lng: ring.reduce((s, p) => s + p[1], 0) / n, area: 0 };
  }
  return { lat: cy / (3 * a), lng: cx / (3 * a), area: Math.abs(a / 2) };
}

/**
 * Every building of the block as a selectable entity, from the Tel Aviv-Yafo municipal GIS:
 * surveyed footprints and heights, addresses, block/parcel, year, floors, pilotis and preservation status.
 */
export const ALL_BUILDINGS: BuildingPlot[] = (() => {
  const list: BuildingPlot[] = GIS_BUILDINGS.map((g) => {
    const addresses: BuildingAddress[] = g.a.map(([street, number, entrance, gush, helka]) => ({
      street,
      streetHe: streetDisplayHe(street),
      streetEn: streetDisplayEn(street),
      number,
      entrance,
      gush,
      helka,
    }));
    // Prefer a Chissin address as the primary title
    addresses.sort((x, y) => Number(y.street === 'חיסין') - Number(x.street === 'חיסין'));
    const primary = addresses[0];

    // Centroid of the largest part
    let best = { lat: 0, lng: 0, area: -1 };
    for (const poly of g.p) {
      const c = ringCentroid(poly[0]);
      if (c.area > best.area) best = c;
    }

    const name = g.n || undefined;
    const titleHe = primary ? formatAddressHe(primary) : '';
    const titleEn = primary ? formatAddressEn(primary) : '';

    return {
      id: g.id,
      addresses,
      titleHe: name && titleHe ? `${name} · ${titleHe}` : titleHe || name || '',
      titleEn: name && titleEn ? `${name} · ${titleEn}` : titleEn || name || '',
      number: primary?.number ?? 0,
      street: primary?.streetEn ?? '',
      streetHe: primary?.streetHe ?? '',
      name,
      kind: g.k,
      polygons: g.p,
      baseElevation: g.b,
      pilotis: g.pl === 1,
      centerCoordinates: { lat: best.lat, lng: best.lng, elevation: g.b + g.h },
      height: g.h,
      levels: g.f && g.f > 0 ? g.f : Math.max(1, Math.round(g.h / 3.2)),
      yearBuilt: g.y ?? null,
      preservation: g.pr ? { type: g.pr[0], plan: g.pr[1], strict: g.pr[2] === 1, note: g.pr[3] } : undefined,
      isChissin: addresses.some((a) => a.street === 'חיסין'),
    };
  });

  // Unaddressed structures (kiosks, bus stops, sheds): name them after the nearest addressed building
  const addressed = list.filter((b) => b.addresses.length);
  const distM = (a: BuildingPlot, b: BuildingPlot) =>
    Math.hypot(
      (a.centerCoordinates.lat - b.centerCoordinates.lat) * 111320,
      (a.centerCoordinates.lng - b.centerCoordinates.lng) * 94330
    );
  for (const b of list) {
    if (b.titleHe) continue;
    const near = addressed.reduce((best, x) => (distM(b, x) < distM(b, best) ? x : best), addressed[0]);
    const kindHe = b.kind || 'מבנה';
    const kindEn = (b.kind && KIND_EN[b.kind]) || 'Structure';
    b.titleHe = near ? `${kindHe} ליד ${near.titleHe}` : kindHe;
    b.titleEn = near ? `${kindEn} near ${near.titleEn}` : kindEn;
  }
  return list;
})();

export const BUILDINGS_BY_ID: Map<string, BuildingPlot> = new Map(ALL_BUILDINGS.map((b) => [b.id, b]));

/** Resolves ids saved by older versions of the app (OpenStreetMap ids). */
export function resolveBuildingId(id: string): string | undefined {
  if (BUILDINGS_BY_ID.has(id)) return id;
  const mapped = LEGACY_BUILDING_IDS[id];
  return mapped && BUILDINGS_BY_ID.has(mapped) ? mapped : undefined;
}

/**
 * Buildings that share an address are parts of one building file (e.g. a main building and its
 * annex on the same lot). Documents are shown on every part and pinned to the largest part.
 */
const GROUP_OF = new Map<string, string[]>();
(() => {
  const parent = new Map<string, string>(ALL_BUILDINGS.map((b) => [b.id, b.id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  const byAddr = new Map<string, string>();
  for (const b of ALL_BUILDINGS) {
    for (const a of b.addresses) {
      const k = `${a.street}|${a.number}|${a.entrance}`;
      const other = byAddr.get(k);
      if (other) parent.set(find(b.id), find(other));
      else byAddr.set(k, b.id);
    }
  }
  const groups = new Map<string, BuildingPlot[]>();
  for (const b of ALL_BUILDINGS) {
    const r = find(b.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(b);
  }
  for (const members of groups.values()) {
    // Largest (by footprint extent x height) first
    const size = (b: BuildingPlot) => b.height * b.polygons.reduce((s, p) => s + p[0].length, 0);
    members.sort((x, y) => size(y) - size(x));
    const ids = members.map((m) => m.id);
    ids.forEach((id) => GROUP_OF.set(id, ids));
  }
})();

/** All building ids that form the same building as `id` (the first one is the primary part). */
export function buildingGroup(id: string): string[] {
  return GROUP_OF.get(id) ?? [id];
}
