import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHISSIN_CENTER,
  latLngToWorld,
  worldToLatLng,
  calculateDistanceMeters,
  isWithinChissinBlock,
  formatCoordinatesDMS,
  filterDocuments,
} from './geo.ts';
import { GeotaggedDocument, FilterOptions } from '../types/index.ts';

test('latLngToWorld maps center coordinates to (0, 0)', () => {
  const world = latLngToWorld(CHISSIN_CENTER.lat, CHISSIN_CENTER.lng);
  assert.equal(world.x, 0);
  assert.equal(world.z, 0);
});

test('worldToLatLng roundtrips accurately with latLngToWorld', () => {
  const originalLat = 32.0742;
  const originalLng = 34.7755;
  const world = latLngToWorld(originalLat, originalLng);
  const roundtrip = worldToLatLng(world.x, world.z);

  assert.ok(Math.abs(roundtrip.lat - originalLat) < 0.0001);
  assert.ok(Math.abs(roundtrip.lng - originalLng) < 0.0001);
});

test('calculateDistanceMeters produces sensible physical distance', () => {
  const coordA = { lat: 32.07380, lng: 34.77740 };
  // Approximately 100 meters East
  const coordB = { lat: 32.07380, lng: 34.77846 };
  const dist = calculateDistanceMeters(coordA, coordB);
  assert.ok(dist >= 95 && dist <= 105, `Distance was ${dist}, expected ~100m`);
});

test('isWithinChissinBlock identifies coordinates in Chissin neighborhood', () => {
  assert.equal(isWithinChissinBlock(32.0738, 34.7748), true); // Chissin
  assert.equal(isWithinChissinBlock(31.7683, 35.2137), false); // Jerusalem
});

test('formatCoordinatesDMS creates valid DMS representation', () => {
  const dms = formatCoordinatesDMS(32.07385, 34.77485);
  assert.ok(dms.includes('32°'));
  assert.ok(dms.includes('N'));
  assert.ok(dms.includes('34°'));
  assert.ok(dms.includes('E'));
});

test('filterDocuments filters correctly by category, year, and query', () => {
  const mockDocs: GeotaggedDocument[] = [
    {
      id: 'doc-1',
      title: 'Building Permit 1934',
      titleHe: 'היתר בנייה 1934',
      category: 'permit',
      address: '7 Chissin St',
      addressHe: 'חיסין 7',
      buildingNumber: 7,
      coordinates: { lat: 32.0738, lng: 34.7747 },
      year: 1934,
      dateStr: '1934-05-12',
      description: 'Original municipal permit',
      descriptionHe: 'היתר עירוני מקורי',
      isDriveSynced: true,
      driveUrl: 'https://drive.google.com/file/d/123',
    },
    {
      id: 'doc-2',
      title: 'Architectural Blueprint Facade',
      titleHe: 'תכנית אדריכלית חזית',
      category: 'architectural',
      address: '14 Chissin St',
      addressHe: 'חיסין 14',
      buildingNumber: 14,
      coordinates: { lat: 32.0740, lng: 34.7750 },
      year: 1938,
      dateStr: '1938-11-20',
      description: 'Bauhaus elevation drawing',
      descriptionHe: 'חזית באוהאוס',
      isDriveSynced: false,
    },
  ];

  const filterPermit: FilterOptions = {
    searchQuery: '',
    category: 'permit',
    buildingNumber: 'all',
    yearMin: 1920,
    yearMax: 2026,
    onlyDriveFiles: false,
  };
  const permits = filterDocuments(mockDocs, filterPermit);
  assert.equal(permits.length, 1);
  assert.equal(permits[0].id, 'doc-1');

  const filterHebrewSearch: FilterOptions = {
    searchQuery: 'באוהאוס',
    category: 'all',
    buildingNumber: 'all',
    yearMin: 1920,
    yearMax: 2026,
    onlyDriveFiles: false,
  };
  const searchResults = filterDocuments(mockDocs, filterHebrewSearch);
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].id, 'doc-2');

  const filterDrive: FilterOptions = {
    searchQuery: '',
    category: 'all',
    buildingNumber: 'all',
    yearMin: 1920,
    yearMax: 2026,
    onlyDriveFiles: true,
  };
  const driveResults = filterDocuments(mockDocs, filterDrive);
  assert.equal(driveResults.length, 1);
  assert.equal(driveResults[0].id, 'doc-1');
});
