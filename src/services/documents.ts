import { GeotaggedDocument } from '../types/index.ts';
import { ALL_BUILDINGS, BUILDINGS_BY_ID } from '../data/buildings.ts';
import { FOLDER_LINKS, ROOT_AREA, BUILDING_COMPOUNDS } from '../data/driveFolders.ts';
import { buildBuildingIndex, linkFileToBuildings, extractYear, cleanDocumentTitle } from '../utils/addressMatch.ts';
import { DriveFileItem, inferCategoryFromFilename, formatBytes, driveViewUrl } from './drive.ts';
import { CHISSIN_CENTER } from '../utils/geo.ts';

const ASSIGNMENTS_KEY = 'gedes.docAssignments';

/** Manual "file → building" links made in this browser (override automatic matching). */
export type ManualAssignments = Record<string, string>;

export function loadAssignments(): ManualAssignments {
  try {
    return JSON.parse(localStorage.getItem(ASSIGNMENTS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function saveAssignments(a: ManualAssignments) {
  try {
    localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(a));
  } catch {
    /* storage unavailable */
  }
}

const index = buildBuildingIndex(ALL_BUILDINGS);

// Building compounds: every member maps to the compound's first (primary) id.
const COMPOUND_PRIMARY = new Map<string, string>();
const COMPOUND_MEMBERS = new Map<string, string[]>();
for (const group of BUILDING_COMPOUNDS) {
  for (const id of group) {
    COMPOUND_PRIMARY.set(id, group[0]);
    COMPOUND_MEMBERS.set(id, group);
  }
}
const canonical = (id: string) => COMPOUND_PRIMARY.get(id) ?? id;

/** All OSM envelope ids that make up the same building as `id`. */
export function buildingMembers(id: string): string[] {
  return COMPOUND_MEMBERS.get(id) ?? [id];
}

interface ResolvedLink {
  buildingIds: string[];
  matchedBy?: GeotaggedDocument['matchedBy'];
  areaHe?: string;
  areaEn?: string;
}

/** Resolves which buildings (or which public area) a Drive file belongs to. */
export function resolveFileLink(
  file: Pick<DriveFileItem, 'name' | 'folderPath' | 'folderIds'>,
  manual?: string
): ResolvedLink {
  if (manual && BUILDINGS_BY_ID.has(manual)) {
    return { buildingIds: [canonical(manual)], matchedBy: 'manual' };
  }

  // 1. Curated folder links (innermost folder first)
  const ids = file.folderIds ?? [];
  for (let i = ids.length - 1; i >= 0; i--) {
    const link = FOLDER_LINKS[ids[i]];
    if (link?.buildingIds) return { buildingIds: link.buildingIds.map(canonical), matchedBy: 'folder' };
    if (link?.areaHe) {
      // An address in the file name of an area document still wins, e.g. a plan for one building.
      const own = linkFileToBuildings(file.name, [], index);
      if (own.buildingIds.length && own.source === 'filename') {
        return { buildingIds: dedupe(own.buildingIds.map(canonical)), matchedBy: 'filename' };
      }
      return { buildingIds: [], areaHe: link.areaHe, areaEn: link.areaEn };
    }
  }

  // 2. Addresses / block-parcel in the file name, then in folder names
  const auto = linkFileToBuildings(file.name, file.folderPath, index);
  if (auto.buildingIds.length) {
    return { buildingIds: dedupe(auto.buildingIds.map(canonical)), matchedBy: auto.source ?? undefined };
  }

  // 3. Index documents in the root of the collection
  if (ids.length === 0) return { buildingIds: [], ...ROOT_AREA };
  return { buildingIds: [] };
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function driveFileToDocument(file: DriveFileItem, assignments: ManualAssignments): GeotaggedDocument {
  const title = cleanDocumentTitle(file.name);
  const link = resolveFileLink(file, assignments[file.id]);
  const primary = link.buildingIds.length ? BUILDINGS_BY_ID.get(link.buildingIds[0]) : undefined;
  const baseName = file.name.replace(/\.[^/.]{1,5}$/, '');
  const year = extractYear(baseName) || extractYear(file.folderPath.join(' '));
  const gh = primary?.addresses.find((a) => a.gush && a.helka);

  return {
    id: `drive-${file.id}`,
    title,
    titleHe: title,
    category: inferCategoryFromFilename(`${file.folderPath[file.folderPath.length - 1] ?? ''} ${file.name}`, file.mimeType),
    address: primary ? `${primary.titleEn}, Tel Aviv` : link.areaEn ?? '',
    addressHe: primary ? `${primary.titleHe}, תל אביב` : link.areaHe ?? '',
    buildingNumber: primary?.number ?? 0,
    buildingId: primary?.id,
    buildingIds: link.buildingIds,
    matchedBy: link.matchedBy,
    areaHe: primary ? undefined : link.areaHe,
    areaEn: primary ? undefined : link.areaEn,
    coordinates: primary
      ? {
          lat: primary.centerCoordinates.lat,
          lng: primary.centerCoordinates.lng,
          elevation: primary.height + 3,
        }
      : { ...CHISSIN_CENTER, elevation: 0 },
    year,
    dateStr: (file.modifiedTime || file.createdTime || '').split('T')[0],
    fileId: file.id,
    driveUrl: file.webViewLink || driveViewUrl(file.id),
    thumbnailUrl: file.thumbnailLink,
    fileSize: formatBytes(file.size),
    mimeType: file.mimeType,
    drivePath: file.folderPath.join(' / '),
    description: file.description || '',
    descriptionHe: file.description || '',
    gushHelka: gh ? `גוש ${gh.gush} חלקה ${gh.helka}` : undefined,
    isDriveSynced: true,
  };
}

/** Does the document belong to the given building (or another part of the same building)? */
export function documentBelongsTo(doc: GeotaggedDocument, buildingId: string): boolean {
  const members = buildingMembers(buildingId);
  return (
    (!!doc.buildingId && members.includes(doc.buildingId)) ||
    !!doc.buildingIds?.some((id) => members.includes(id))
  );
}
