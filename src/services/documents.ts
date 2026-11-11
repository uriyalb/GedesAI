import { GeotaggedDocument } from '../types/index.ts';
import { ALL_BUILDINGS, BUILDINGS_BY_ID } from '../data/buildings.ts';
import { buildBuildingIndex, linkFileToBuildings, extractYear } from '../utils/addressMatch.ts';
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

export function driveFileToDocument(file: DriveFileItem, assignments: ManualAssignments): GeotaggedDocument {
  const baseName = file.name.replace(/\.[^/.]{1,5}$/, '');
  const auto = linkFileToBuildings(file.name, file.folderPath, index);

  let buildingIds = auto.buildingIds;
  let matchedBy: GeotaggedDocument['matchedBy'] = auto.source ?? undefined;
  const manual = assignments[file.id];
  if (manual && BUILDINGS_BY_ID.has(manual)) {
    buildingIds = [manual, ...buildingIds.filter((id) => id !== manual)];
    matchedBy = 'manual';
  }

  const primary = buildingIds.length ? BUILDINGS_BY_ID.get(buildingIds[0]) : undefined;
  const year = extractYear(baseName) || extractYear(file.folderPath.join(' '));
  const gh = primary?.addresses.find((a) => a.gush && a.helka);

  return {
    id: `drive-${file.id}`,
    title: baseName,
    titleHe: baseName,
    category: inferCategoryFromFilename(`${file.folderPath.join(' ')} ${file.name}`, file.mimeType),
    address: primary ? `${primary.titleEn}, Tel Aviv` : '',
    addressHe: primary ? `${primary.titleHe}, תל אביב` : '',
    buildingNumber: primary?.number ?? 0,
    buildingId: primary?.id,
    buildingIds,
    matchedBy,
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

/** Does the document belong to the given building? */
export function documentBelongsTo(doc: GeotaggedDocument, buildingId: string): boolean {
  return doc.buildingId === buildingId || !!doc.buildingIds?.includes(buildingId);
}
