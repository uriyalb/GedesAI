/**
 * Curated links for folders of the shared Drive collection whose name alone doesn't
 * identify the right building (verified against the collection's central index document,
 * "אוסף תיקי בניין והיקף הבלוק - מסמך מרכז", 11-11-2026).
 *
 * Keys are Drive folder ids. A folder link applies to every file inside it (including
 * sub-folders) and takes precedence over addresses found in file names.
 *  - buildingIds: link the files to these buildings (OSM envelope ids, see realWorldBlock.ts)
 *  - areaHe/areaEn: the files describe a public space / plan area rather than one building
 */
export interface FolderLink {
  buildingIds?: string[];
  areaHe?: string;
  areaEn?: string;
}

const HABIMA = 'b-149522836'; // הבימה 1 / תרס"ט 2
const BEN_ZION_3_COMPLEX = 'b-495363269'; // שדרות בן ציון 3 / חיסין 4א-4ג
const BEN_ZION_1 = 'b-149523867'; // שדרות בן ציון 1 / המלך ג'ורג' 48

export const FOLDER_LINKS: Record<string, FolderLink> = {
  // "חיסין 4" holds archive file 03500030 of חיסין 4ג / שדרות בן ציון 3 (building 31612),
  // not plain חיסין 4 (building 31616), even though the file names start with "חיסין 4".
  '1qBW4yqwDW6MIna5z3DhTIB7VlebgUmbV': { buildingIds: [BEN_ZION_3_COMPLEX] },

  // Cultural sites with a building in the model
  '11QM2bLHsnyCfrdhWOTtTptECzkeHfpOv': { buildingIds: [HABIMA] }, // בית הבימה
  '1KOWUU7HU6YCfM6WjsCSjgrR9uW8Sl6GR': { buildingIds: [HABIMA] }, // כיכר התזמורת והבימה – תא 3264, תא/מק 3660
  '14Et3OOadwLEVGRcOljIZ5Mc9ZFUbRHGd': { buildingIds: [BEN_ZION_1] }, // קולנוע מקסים והאוזן השלישית

  // Public spaces and area-wide plans
  '1-RseJh-SxsnOqoIJ8xLvpeECuQ8YWwMr': { areaHe: 'מטרו M2 – תחנת הבימה', areaEn: 'Metro M2 – Habima station' },
  '1XoI12l3GU4u0cbnBhiwFDKm9GMJzsf0R': { areaHe: 'חניון ציבורי – תא/2458', areaEn: 'Public parking – TA/2458' },
  '16eEOzArfVu8HutUqZRBT7Rgjn4ye6LwT': { areaHe: 'כיכר המייסדים / כיכר מיכאלס', areaEn: 'Founders / Michaels Square' },
  '1Q9SDo6AkFZC-5w8Ejk3nMgCI4HMaNHFh': { areaHe: 'כיכר המייסדים / כיכר מיכאלס', areaEn: 'Founders / Michaels Square' },
  '1N9cytbBuljY61m_576pw0vL0-bhY90LQ': { areaHe: 'גן יעקב', areaEn: 'Gan Yaakov' },
  '1Td0JR7_qOKrVy3GMZ0MEbLi_aa6Uo-Cx': { areaHe: 'היכל התרבות', areaEn: 'Culture Palace' },
  '1aBn2s5wLangIONglzFBxcvusIQcg5k5T': { areaHe: 'היקף הבלוק – אינדקס', areaEn: 'Block perimeter – index' },
};

/** Files directly in the root of the shared folder (index documents). */
export const ROOT_AREA = { areaHe: 'מסמכי האוסף', areaEn: 'Collection documents' };

/**
 * Buildings that are separate OSM envelopes but one municipal building / file.
 * The first id is the one documents are pinned to.
 */
export const BUILDING_COMPOUNDS: string[][] = [
  // שדרות בן ציון 3 / חיסין 4א, 4ב, 4ג
  ['b-495363269', 'b-495363270', 'b-495363271', 'b-495363272', 'b-495363273', 'b-495363274', 'b-495363275'],
];
