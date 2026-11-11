import { BuildingPlot } from '../types/index.ts';
import { STREETS } from '../data/buildings.ts';

/**
 * Links Google Drive files to buildings by recognising addresses (street + house number)
 * or block/parcel numbers (גוש/חלקה) in the file name or in the names of its parent folders.
 */

export interface AddressMatch {
  buildingId: string;
  /** Normalised address that matched, e.g. "חיסין|20|" */
  key: string;
  via: 'address' | 'gush-helka';
}

const QUOTES = /[״"'׳`’‘]/g;
const SEPARATORS = /[_\-–—.,;:/\\()[\]{}+#|~]/g;

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(QUOTES, '')
    .replace(SEPARATORS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const isLatin = (s: string) => /[a-z]/.test(s);

interface StreetPattern {
  street: string; // GIS name
  re: RegExp;
  reverse?: RegExp; // "20 Chissin St" (Latin only)
}

function buildStreetPatterns(): StreetPattern[] {
  const out: { street: string; alias: string }[] = [];
  for (const [gis, info] of Object.entries(STREETS)) {
    const names = new Set<string>();
    const add = (n: string) => {
      const norm = normalizeText(n);
      if (norm.length >= 2) names.add(norm);
    };
    add(gis);
    add(info.he);
    add(info.he.replace(/^(שדרות|כיכר)\s+/, ''));
    add(info.en);
    info.aliases.forEach(add);
    names.forEach((alias) => out.push({ street: gis, alias }));
  }
  // Longest aliases first so "שדרות בן ציון" wins over "בן ציון".
  out.sort((a, b) => b.alias.length - a.alias.length);

  const NUM = '(\\d{1,3})(?:\\s?([א-ו]|[a-f]))?(?![\\p{L}\\d])';
  const FILLER = '(?:\\s?(?:רחוב|רח|מספר|מס|street|st|blvd|no))?\\s?';
  return out.map(({ street, alias }) => {
    const a = escapeRegExp(alias).replace(/ /g, '\\s?');
    const prefix = isLatin(alias) ? '' : '(?:[ובלמה]{0,2})';
    return {
      street,
      re: new RegExp(`(?<![\\p{L}\\d])${prefix}${a}${FILLER}${NUM}`, 'gu'),
      reverse: isLatin(alias)
        ? new RegExp(`(?<![\\p{L}\\d])(\\d{1,3})([a-f])?\\s?${a}(?![\\p{L}])`, 'gu')
        : undefined,
    };
  });
}

let STREET_PATTERNS: StreetPattern[] | null = null;

const GUSH_HELKA = [
  /גוש\s?(\d{3,5})\s?(?:חלקה|חלקות|ח)\s?(\d{1,4})/gu,
  /gush\s?(\d{3,5})\s?(?:helka|chelka|parcel)\s?(\d{1,4})/gu,
];

export interface BuildingIndex {
  byAddress: Map<string, string[]>;
  byNumber: Map<string, string[]>; // street|number (any entrance)
  byGushHelka: Map<string, string[]>;
}

export function buildBuildingIndex(buildings: BuildingPlot[]): BuildingIndex {
  const byAddress = new Map<string, string[]>();
  const byNumber = new Map<string, string[]>();
  const byGushHelka = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, id: string) => {
    const arr = m.get(k);
    if (!arr) m.set(k, [id]);
    else if (!arr.includes(id)) arr.push(id);
  };
  for (const b of buildings) {
    for (const a of b.addresses) {
      push(byAddress, `${a.street}|${a.number}|${a.entrance}`, b.id);
      push(byNumber, `${a.street}|${a.number}`, b.id);
      if (a.gush && a.helka) push(byGushHelka, `${a.gush}/${a.helka}`, b.id);
    }
  }
  return { byAddress, byNumber, byGushHelka };
}

const HEB_TO_LATIN_ENTRANCE: Record<string, string> = { a: 'א', b: 'ב', c: 'ג', d: 'ד', e: 'ה', f: 'ו' };

function lookupAddress(index: BuildingIndex, street: string, num: number, entrance: string): string[] {
  const ent = HEB_TO_LATIN_ENTRANCE[entrance] ?? entrance;
  return (
    index.byAddress.get(`${street}|${num}|${ent}`) ??
    index.byAddress.get(`${street}|${num}|`) ??
    index.byNumber.get(`${street}|${num}`) ??
    []
  );
}

/** Finds every building referenced in a piece of text, in order of appearance. */
export function findBuildingsInText(text: string, index: BuildingIndex): AddressMatch[] {
  if (!STREET_PATTERNS) STREET_PATTERNS = buildStreetPatterns();
  const norm = normalizeText(text);
  const found: { pos: number; match: AddressMatch }[] = [];
  const seen = new Set<string>();
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([ts, te]) => s < te && e > ts);

  const record = (pos: number, end: number, ids: string[], key: string, via: AddressMatch['via']) => {
    if (overlaps(pos, end)) return;
    taken.push([pos, end]);
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      found.push({ pos, match: { buildingId: id, key, via } });
    }
  };

  for (const p of STREET_PATTERNS) {
    for (const m of norm.matchAll(p.re)) {
      const num = parseInt(m[1], 10);
      const ids = lookupAddress(index, p.street, num, m[2] ?? '');
      if (ids.length) record(m.index!, m.index! + m[0].length, ids, `${p.street}|${num}|${m[2] ?? ''}`, 'address');
    }
    if (p.reverse) {
      for (const m of norm.matchAll(p.reverse)) {
        const num = parseInt(m[1], 10);
        const ids = lookupAddress(index, p.street, num, m[2] ?? '');
        if (ids.length) record(m.index!, m.index! + m[0].length, ids, `${p.street}|${num}|${m[2] ?? ''}`, 'address');
      }
    }
  }

  for (const re of GUSH_HELKA) {
    for (const m of norm.matchAll(re)) {
      const key = `${m[1]}/${parseInt(m[2], 10)}`;
      const ids = index.byGushHelka.get(key) ?? [];
      if (ids.length) record(m.index!, m.index! + m[0].length, ids, key, 'gush-helka');
    }
  }

  return found.sort((a, b) => a.pos - b.pos).map((f) => f.match);
}

export interface FileLinkResult {
  buildingIds: string[];
  source: 'filename' | 'folder' | 'gush-helka' | null;
}

/**
 * Resolves the buildings of a Drive file: addresses in the file name win;
 * otherwise the closest parent folder that names an address is used.
 */
export function linkFileToBuildings(fileName: string, folderPath: string[], index: BuildingIndex): FileLinkResult {
  const base = fileName.replace(/\.[^/.]{1,5}$/, '');
  const own = findBuildingsInText(base, index);
  if (own.length) {
    return {
      buildingIds: own.map((m) => m.buildingId),
      source: own[0].via === 'gush-helka' ? 'gush-helka' : 'filename',
    };
  }
  for (let i = folderPath.length - 1; i >= 0; i--) {
    const inFolder = findBuildingsInText(folderPath[i], index);
    if (inFolder.length) {
      return { buildingIds: inFolder.map((m) => m.buildingId), source: 'folder' };
    }
  }
  return { buildingIds: [], source: null };
}

/** Extracts a plausible document year (1900–2029) from a file name. */
export function extractYear(text: string): number {
  const m = text.match(/(?<!\d)(19\d{2}|20[0-2]\d)(?!\d)/);
  return m ? parseInt(m[1], 10) : 0;
}
