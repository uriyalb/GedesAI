import { BuildingAddress, BuildingPlot } from '../types/index.ts';
import { REAL_BUILDINGS } from './realWorldBlock.ts';
import { BUILDING_REGISTRY } from './buildingRegistry.ts';

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

function decodeEntities(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/**
 * Every OSM building envelope in the block as a selectable entity,
 * enriched with the municipal GIS addresses, year, floors and preservation status.
 */
export const ALL_BUILDINGS: BuildingPlot[] = REAL_BUILDINGS.filter((b) => b.polygon.length >= 3).map((b) => {
  const reg = BUILDING_REGISTRY[b.id];
  let addresses: BuildingAddress[] = (reg?.a ?? []).map(([street, number, entrance, gush, helka]) => ({
    street,
    streetHe: streetDisplayHe(street),
    streetEn: streetDisplayEn(street),
    number,
    entrance,
    gush,
    helka,
  }));

  // Fall back to the OSM address tags if the GIS had nothing.
  if (addresses.length === 0 && b.street && b.housenumber) {
    const street = decodeEntities(b.street).replace(/^שדרות\s+/, '');
    const m = b.housenumber.match(/^(\d+)(\D*)$/);
    addresses = [
      {
        street,
        streetHe: streetDisplayHe(street),
        streetEn: streetDisplayEn(street),
        number: m ? parseInt(m[1], 10) : 0,
        entrance: m ? m[2] : '',
        gush: null,
        helka: null,
      },
    ];
  }

  // Prefer a Chissin address as the primary title for buildings on the street itself.
  const sorted = [...addresses].sort((x, y) => {
    const cx = x.street === 'חיסין' ? 0 : 1;
    const cy = y.street === 'חיסין' ? 0 : 1;
    return cx - cy;
  });
  const primary = sorted[0];

  const name = b.name || undefined;
  const titleHe = primary
    ? formatAddressHe(primary)
    : name || 'מבנה ללא כתובת רשומה';
  const titleEn = primary ? formatAddressEn(primary) : name || 'Unaddressed building';

  return {
    id: b.id,
    addresses: sorted,
    titleHe: name && primary ? `${name} · ${titleHe}` : titleHe,
    titleEn: name && primary ? `${name} · ${titleEn}` : titleEn,
    number: primary?.number ?? 0,
    street: primary?.streetEn ?? '',
    streetHe: primary?.streetHe ?? '',
    name,
    centerCoordinates: { lat: b.center.lat, lng: b.center.lng, elevation: b.height },
    height: b.height,
    levels: reg?.f && reg.f > 0 ? reg.f : b.levels,
    yearBuilt: reg?.y && reg.y > 1800 ? reg.y : null,
    preservation: reg?.p
      ? { type: reg.p[0], plan: reg.p[1], strict: reg.p[2] === 1, note: reg.p[3] }
      : undefined,
    isChissin: addresses.some((a) => a.street === 'חיסין'),
  };
});

export const BUILDINGS_BY_ID: Map<string, BuildingPlot> = new Map(ALL_BUILDINGS.map((b) => [b.id, b]));
