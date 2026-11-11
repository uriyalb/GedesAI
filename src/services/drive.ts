import { getAccessToken, clearAccessToken } from './auth.ts';
import { DocumentCategory } from '../types/index.ts';

export const TARGET_FOLDER_ID = '1h-QXqwpMGGOIjGzZEll8ZszRyCJvN2w1';
export const TARGET_FOLDER_URL = `https://drive.google.com/drive/folders/${TARGET_FOLDER_ID}`;

const API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
const MAX_DEPTH = 6;
const MAX_FILES = 3000;

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  description?: string;
  /** Names of the sub-folders between the root shared folder and the file. */
  folderPath: string[];
  /** Ids of those sub-folders (same order as folderPath). */
  folderIds: string[];
  shortcutDetails?: { targetId: string; targetMimeType: string };
  /** Photo metadata extracted by Drive (EXIF), incl. GPS location when the camera recorded it. */
  imageMediaMetadata?: {
    location?: { latitude: number; longitude: number; altitude?: number };
    time?: string;
  };
  /** Custom Drive properties – the app stores manual photo locations here. */
  properties?: Record<string, string>;
  capabilities?: { canEdit?: boolean };
  /** A tagged photo that lives outside the shared collection folder. */
  outsideCollection?: boolean;
}

export class DriveAuthError extends Error {}
/** The access token doesn't include permission to edit Drive files. */
export class DriveScopeError extends Error {}
/** The signed-in user can't edit this file. */
export class DrivePermissionError extends Error {}

/** Keys of the Drive file properties used to store a manual photo location. */
export const PHOTO_PROPS = { flag: 'gedesGeo', lat: 'gedesLat', lng: 'gedesLng', alt: 'gedesAlt' } as const;

/**
 * Categorize a file from its name (and folder names) or MIME type.
 * Archive files are named like "חיסין 20 - תכניות קומות חזיתות וחתכים - 1936 - …".
 */
export function inferCategoryFromFilename(name: string, mimeType = ''): DocumentCategory {
  const lower = name.toLowerCase();
  const has = (...words: string[]) => words.some((w) => lower.includes(w));
  if (has('היתר', 'רישיון', 'רשיון', 'רישוי', 'טופס 4', 'גמר בני', 'אישור גמר', 'permit', 'license')) {
    return 'permit';
  }
  if (has('שימור', 'תיק תיעוד', 'conservation', 'preservation')) {
    return 'preservation';
  }
  if (has('תשריט', 'טאבו', 'חלוקה', 'גוש', 'מדידה', 'טופוגרפי', 'תרשים סביבה', 'תרשים מגרש', 'cadastral', 'parcel', 'survey')) {
    return 'cadastral';
  }
  if (mimeType.startsWith('image/') || has('תצלום', 'צילום', 'תמונה', 'photo')) {
    return 'photo';
  }
  // Facade drawings, but not general plan sheets that also include elevations
  if (has('חזית', 'facade') && !has('תכני', 'תוכני', 'קומ', 'plan')) {
    return 'facade';
  }
  return 'architectural';
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes?: string | number): string {
  if (!bytes) return '';
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(b) || b <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), units.length - 1);
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

async function driveFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    clearAccessToken();
    throw new DriveAuthError('Google sign-in expired');
  }
  return res;
}

const FILE_FIELDS =
  'id,name,mimeType,webViewLink,webContentLink,thumbnailLink,iconLink,size,createdTime,modifiedTime,description,shortcutDetails,' +
  'imageMediaMetadata(location,time),properties,capabilities(canEdit)';

async function listChildren(folderId: string, token: string): Promise<Omit<DriveFileItem, 'folderPath'>[]> {
  const items: Omit<DriveFileItem, 'folderPath'>[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: `nextPageToken, files(${FILE_FIELDS})`,
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      orderBy: 'name',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await driveFetch(`${API}/files?${params}`, token);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Drive API error ${res.status}`);
    }
    const data = await res.json();
    items.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

/**
 * Lists every file in the shared folder, including files inside sub-folders.
 */
export async function fetchDriveFolderFiles(
  folderId: string = TARGET_FOLDER_ID
): Promise<{ files: DriveFileItem[]; error?: string; needsAuth?: boolean }> {
  const token = getAccessToken();
  if (!token) {
    return { files: [], needsAuth: true };
  }

  const files: DriveFileItem[] = [];
  const visited = new Set<string>();

  const walk = async (id: string, path: string[], ids: string[], depth: number) => {
    if (visited.has(id) || depth > MAX_DEPTH || files.length >= MAX_FILES) return;
    visited.add(id);
    const children = await listChildren(id, token);
    const subfolders: { id: string; name: string }[] = [];
    for (const c of children) {
      if (c.mimeType === FOLDER_MIME) {
        subfolders.push({ id: c.id, name: c.name });
      } else if (c.mimeType === SHORTCUT_MIME && c.shortcutDetails?.targetMimeType === FOLDER_MIME) {
        subfolders.push({ id: c.shortcutDetails.targetId, name: c.name });
      } else if (c.mimeType === SHORTCUT_MIME && c.shortcutDetails) {
        files.push({
          ...c,
          id: c.shortcutDetails.targetId,
          mimeType: c.shortcutDetails.targetMimeType,
          folderPath: path,
          folderIds: ids,
        });
      } else {
        files.push({ ...c, folderPath: path, folderIds: ids });
      }
    }
    // Walk sub-folders a few at a time
    for (let i = 0; i < subfolders.length; i += 6) {
      await Promise.all(
        subfolders.slice(i, i + 6).map((f) => walk(f.id, [...path, f.name], [...ids, f.id], depth + 1))
      );
    }
  };

  try {
    await walk(folderId, [], [], 0);
    return { files };
  } catch (err: any) {
    if (err instanceof DriveAuthError) return { files: [], needsAuth: true };
    console.error('Error fetching Drive files:', err);
    return { files, error: err?.message || 'Network error fetching Google Drive files' };
  }
}

/** Google-native formats that must be exported to be viewed. */
export function isGoogleNative(mimeType?: string): boolean {
  return !!mimeType && mimeType.startsWith('application/vnd.google-apps.');
}

/**
 * Downloads a file's content (or a PDF export of Google Docs/Sheets/Slides) as a Blob.
 */
export async function downloadDriveFile(fileId: string, mimeType: string | undefined, signal?: AbortSignal): Promise<Blob> {
  const token = getAccessToken();
  if (!token) throw new DriveAuthError('Not signed in');
  const url = isGoogleNative(mimeType)
    ? `${API}/files/${fileId}/export?mimeType=application/pdf`
    : `${API}/files/${fileId}?alt=media&supportsAllDrives=true`;
  const res = await driveFetch(url, token, { signal });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Drive download failed (${res.status})`);
  }
  return res.blob();
}

/** Direct links that work in the browser for anyone the file is shared with. */
export function drivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

async function listQuery(q: string, token: string, extra: Record<string, string> = {}, max = 500): Promise<DriveFileItem[]> {
  const out: DriveFileItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q,
      fields: `nextPageToken, files(${FILE_FIELDS})`,
      pageSize: String(Math.min(max, 200)),
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      ...extra,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await driveFetch(`${API}/files?${params}`, token);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Drive API error ${res.status}`);
    }
    const data = await res.json();
    out.push(...(data.files || []).map((f: any) => ({ ...f, folderPath: [], folderIds: [] })));
    pageToken = data.nextPageToken;
  } while (pageToken && out.length < max);
  return out;
}

/** Photos tagged on the map that live anywhere in Drive (not only in the collection folder). */
export async function fetchTaggedPhotos(): Promise<DriveFileItem[]> {
  const token = getAccessToken();
  if (!token) return [];
  try {
    const files = await listQuery(
      `properties has { key='${PHOTO_PROPS.flag}' and value='1' } and trashed = false`,
      token
    );
    return files.map((f) => ({ ...f, outsideCollection: true }));
  } catch (e) {
    console.warn('Tagged photo query failed', e);
    return [];
  }
}

/** Searches the user's Drive for images, newest first. */
export async function searchDriveImages(text: string): Promise<DriveFileItem[]> {
  const token = getAccessToken();
  if (!token) throw new DriveAuthError('Not signed in');
  const clauses = ["mimeType contains 'image/'", 'trashed = false'];
  const t = text.trim().replace(/\\/g, '').replace(/'/g, "\\'");
  if (t) clauses.push(`name contains '${t}'`);
  return listQuery(clauses.join(' and '), token, { orderBy: 'modifiedTime desc' }, 60);
}

export interface PhotoLocationInput {
  lat: number;
  lng: number;
  /** Metres above sea level of the camera position. */
  altitude: number;
}

/**
 * Saves (or clears, with null) the map location of a photo as custom properties on the Drive file,
 * so every user with access to the file sees it on the map.
 */
export async function savePhotoLocation(fileId: string, loc: PhotoLocationInput | null): Promise<Record<string, string>> {
  const token = getAccessToken();
  if (!token) throw new DriveAuthError('Not signed in');
  const properties = loc
    ? {
        [PHOTO_PROPS.flag]: '1',
        [PHOTO_PROPS.lat]: loc.lat.toFixed(7),
        [PHOTO_PROPS.lng]: loc.lng.toFixed(7),
        [PHOTO_PROPS.alt]: loc.altitude.toFixed(1),
      }
    : { [PHOTO_PROPS.flag]: null, [PHOTO_PROPS.lat]: null, [PHOTO_PROPS.lng]: null, [PHOTO_PROPS.alt]: null };
  const res = await driveFetch(`${API}/files/${fileId}?supportsAllDrives=true&fields=properties`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties }),
  });
  if (res.ok) return (await res.json()).properties || {};
  const err = await res.json().catch(() => ({}));
  const reason = err?.error?.errors?.[0]?.reason || err?.error?.details?.[0]?.reason || '';
  const msg: string = err?.error?.message || `Drive API error ${res.status}`;
  if (res.status === 403 && /insufficient|scope/i.test(reason + msg)) throw new DriveScopeError(msg);
  if (res.status === 403 || res.status === 404) throw new DrivePermissionError(msg);
  throw new Error(msg);
}

const thumbCache = new Map<string, Promise<ImageBitmap | null>>();

/** Loads a small version of a Drive image for map bubbles (cached). */
export function loadImageThumbnail(fileId: string, thumbnailLink?: string): Promise<ImageBitmap | null> {
  if (!thumbCache.has(fileId)) {
    thumbCache.set(
      fileId,
      (async () => {
        let blob: Blob | null = null;
        if (thumbnailLink) {
          try {
            const r = await fetch(thumbnailLink.replace(/=s\d+$/, '=s320'), { referrerPolicy: 'no-referrer' });
            if (r.ok && (r.headers.get('content-type') || '').startsWith('image/')) blob = await r.blob();
          } catch {
            /* fall back to the API */
          }
        }
        if (!blob) {
          try {
            blob = await downloadDriveFile(fileId, 'image/*');
          } catch {
            return null;
          }
        }
        try {
          const full = await createImageBitmap(blob);
          const scale = Math.min(1, 320 / Math.max(full.width, full.height));
          if (scale === 1) return full;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(full.width * scale);
          canvas.height = Math.round(full.height * scale);
          canvas.getContext('2d')!.drawImage(full, 0, 0, canvas.width, canvas.height);
          full.close();
          return await createImageBitmap(canvas);
        } catch {
          return null;
        }
      })()
    );
  }
  return thumbCache.get(fileId)!;
}
