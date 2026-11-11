import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_BUILDINGS, BUILDINGS_BY_ID, buildingGroup, resolveBuildingId } from '../data/buildings.ts';
import { resolveFileLink, documentBelongsTo, driveFileToDocument } from './documents.ts';
import { inferCategoryFromFilename } from './drive.ts';
import { extractYear, cleanDocumentTitle } from '../utils/addressMatch.ts';

// Real folder ids / file names from the shared collection
const CHISSIN_4 = '1qBW4yqwDW6MIna5z3DhTIB7VlebgUmbV';
const METRO = '1-RseJh-SxsnOqoIJ8xLvpeECuQ8YWwMr';
const HABIMA_HOUSE = '11QM2bLHsnyCfrdhWOTtTptECzkeHfpOv';
const title = (id: string) => BUILDINGS_BY_ID.get(id)!.titleHe;
const at = (street: string, n: number, entrance = '') =>
  ALL_BUILDINGS.find((b) => b.addresses.some((a) => a.street === street && a.number === n && a.entrance === entrance))!.id;

test('files in an address folder link to that building', () => {
  const r = resolveFileLink({
    name: 'חיסין 20 - תכניות קומות חזיתות וחתכים - 14-3-1936 - BD0DA8B8_01138156.pdf',
    folderPath: ['חיסין 20'],
    folderIds: ['1ibeYVNEMAmj1xGlNpJbbdA7Eb-iHC1Sq'],
  });
  assert.deepEqual(r.buildingIds.map(title), ['חיסין 20']);
});

test('numeric file names fall back to the folder address', () => {
  const r = resolveFileLink({ name: '08195087.pdf', folderPath: ['חיסין 27'], folderIds: ['1jDMUDmJdSI_wmRuvk2o_AWBtxzRlKGp3'] });
  assert.equal(r.matchedBy, 'folder');
  assert.deepEqual(r.buildingIds.map(title), ['חיסין 27']);
});

test('the "חיסין 4" folder belongs to the Ben Zion 3 / Chissin 4א-ג building, not plain Chissin 4', () => {
  const r = resolveFileLink({
    name: 'חיסין 4 - היתר בנייה מספר 526 - 4-11-1970 - 4C05533C_13992079.pdf',
    folderPath: ['חיסין 4', 'בדיקות חומרים'],
    folderIds: [CHISSIN_4, '1Vp6T_IlR3k8oHI5XXIrjt0uQfUlZtCZ7'],
  });
  assert.equal(r.buildingIds.length, 1);
  const b = BUILDINGS_BY_ID.get(r.buildingIds[0])!;
  assert.ok(b.addresses.some((a) => a.street === 'בן ציון' && a.number === 3));
  assert.ok(!b.addresses.some((a) => a.street === 'חיסין' && a.number === 4 && a.entrance === ''));
});

test('Ben Zion / Tarsat sub-folders link to their building', () => {
  const r = resolveFileLink({ name: 'שדרות בן ציון 25 - תשריט.pdf', folderPath: ['היקף הבלוק', 'שדרות בן ציון', 'בן ציון 25'], folderIds: ['a', 'b', 'c'] });
  assert.deepEqual(r.buildingIds.map(title), ['שדרות בן ציון 25']);
  const t = resolveFileLink({ name: 'x.pdf', folderPath: ['היקף הבלוק', 'תרס״ט', 'תרס״ט 5'], folderIds: ['a', 'b', 'c'] });
  assert.deepEqual(t.buildingIds.map(title), ['שדרות תרס"ט 5']);
});

test('cultural sites and area plans', () => {
  const h = resolveFileLink({ name: 'בית הבימה - רקע אדריכלי.pdf', folderPath: ['אתרי תרבות', 'בית הבימה'], folderIds: ['x', HABIMA_HOUSE] });
  assert.deepEqual(h.buildingIds, [buildingGroup(at('הבימה', 1))[0]]);
  const m = resolveFileLink({ name: 'סקר עצים בוגרים מטרו M2.pdf', folderPath: ['היקף הבלוק', 'מטרו'], folderIds: ['1aBn2s5wLangIONglzFBxcvusIQcg5k5T', METRO] });
  assert.deepEqual(m.buildingIds, []);
  assert.equal(m.areaHe, 'מטרו M2 – תחנת הבימה');
});

test('manual links override everything and documents show on every part of a compound', () => {
  const doc = driveFileToDocument(
    { id: 'f1', name: 'scan.pdf', mimeType: 'application/pdf', folderPath: ['חיסין 4'], folderIds: [CHISSIN_4] },
    {}
  );
  for (const part of buildingGroup(at('בן ציון', 3))) assert.ok(documentBelongsTo(doc, part));
  const manual = driveFileToDocument(
    { id: 'f1', name: 'scan.pdf', mimeType: 'application/pdf', folderPath: ['חיסין 4'], folderIds: [CHISSIN_4] },
    { f1: at('חיסין', 20) }
  );
  assert.equal(manual.matchedBy, 'manual');
  assert.equal(title(manual.buildingId!), 'חיסין 20');
});

test('year and title cleanup for archive file names', () => {
  assert.equal(extractYear('חיסין 4 - תכנית קומה מעוגלת - 14-5-1968 - 4BBC9E65_01041339'), 1968);
  assert.equal(extractYear('בקשה לגמר בניין - 16.9.1935 - 00192098'), 1935);
  assert.equal(extractYear('חיסין 29 - תכנית קומה - תאריך לא מזוהה - 1F19986A_00917326'), 0);
  assert.equal(
    cleanDocumentTitle('חיסין 4 - תכנית קומה מעוגלת - 14-5-1968 - 4BBC9E65_01041339.pdf'),
    'חיסין 4 - תכנית קומה מעוגלת - 14-5-1968'
  );
});

test('plan sheets with elevations are plans, not facades', () => {
  assert.equal(inferCategoryFromFilename('חיסין 4 - תכניות קומות חזיתות וחתכים'), 'architectural');
  assert.equal(inferCategoryFromFilename('חיסין 26 - חזית בניין היסטורית'), 'facade');
  assert.equal(inferCategoryFromFilename('חיסין 4 - מפה טופוגרפית ומדידת המגרש'), 'cadastral');
  assert.equal(inferCategoryFromFilename('חיסין 4 - היתר בנייה מספר 526'), 'permit');
});

test('manual links saved with old OpenStreetMap ids still resolve', () => {
  assert.equal(title(resolveBuildingId('b-149523884')!), 'חיסין 20');
});
