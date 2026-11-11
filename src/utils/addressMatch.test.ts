import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_BUILDINGS, BUILDINGS_BY_ID } from '../data/buildings.ts';
import { buildBuildingIndex, findBuildingsInText, linkFileToBuildings, extractYear, normalizeText } from './addressMatch.ts';

const index = buildBuildingIndex(ALL_BUILDINGS);
const titles = (text: string) => findBuildingsInText(text, index).map((m) => BUILDINGS_BY_ID.get(m.buildingId)!.titleHe);

test('every building is a separate entity with an address', () => {
  const ids = new Set(ALL_BUILDINGS.map((b) => b.id));
  assert.equal(ids.size, ALL_BUILDINGS.length);
  const unaddressed = ALL_BUILDINGS.filter((b) => b.addresses.length === 0);
  assert.equal(unaddressed.length, 0);
});

test('normalizeText strips quotes and separators', () => {
  assert.equal(normalizeText('שד\' תרס"ט_5'), 'שד תרסט 5');
});

test('matches Hebrew street + number in many spellings', () => {
  assert.deepEqual(titles('היתר בנייה חיסין 20'), ['חיסין 20']);
  assert.deepEqual(titles('חיסין-20 היתר'), ['חיסין 20']);
  assert.deepEqual(titles('רחוב חיסין מס׳ 18'), ['חיסין 18']);
  assert.deepEqual(titles('בחיסין 22 תכנית'), ['חיסין 22']);
  assert.deepEqual(titles('חיסין 24א חזית'), ['חיסין 24א']);
  assert.deepEqual(titles('שדרות בן ציון 31'), ['שדרות בן ציון 31']);
  assert.deepEqual(titles('שמריהו לוין 6'), ['שמריהו לוין 6']);
});

test('matches English spellings', () => {
  assert.deepEqual(titles('Chissin_20_permit'), ['חיסין 20']);
  assert.deepEqual(titles('20 Chissin St plan'), ['חיסין 20']);
});

test('does not treat years as house numbers', () => {
  assert.deepEqual(titles('חיסין 1936'), []);
  assert.equal(extractYear('היתר חיסין 20 1936'), 1936);
  assert.equal(extractYear('חיסין 20'), 0);
});

test('matches block/parcel numbers', () => {
  const b = ALL_BUILDINGS.find((x) => x.addresses.some((a) => a.street === 'חיסין' && a.number === 19))!;
  const a = b.addresses.find((x) => x.number === 19)!;
  assert.deepEqual(
    findBuildingsInText(`תשריט גוש ${a.gush} חלקה ${a.helka}`, index).map((m) => m.buildingId),
    [b.id]
  );
});

test('links by parent folder when the file name has no address', () => {
  const r = linkFileToBuildings('scan_001.pdf', ['ארכיון', 'חיסין 26'], index);
  assert.equal(r.source, 'folder');
  assert.equal(BUILDINGS_BY_ID.get(r.buildingIds[0])!.titleHe, 'חיסין 26');
  assert.equal(linkFileToBuildings('scan_001.pdf', ['ארכיון'], index).source, null);
});

test('corner buildings with two addresses resolve to the same building', () => {
  const a = findBuildingsInText('חיסין 1', index)[0].buildingId;
  const b = findBuildingsInText('דיזנגוף 39', index)[0].buildingId;
  assert.equal(a, b);
});
