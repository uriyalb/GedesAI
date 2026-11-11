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
  shortcutDetails?: { targetId: string; targetMimeType: string };
}

export class DriveAuthError extends Error {}

/**
 * Categorize a file based on its name or MIME type
 */
export function inferCategoryFromFilename(name: string, mimeType = ''): DocumentCategory {
  const lower = name.toLowerCase();
  if (lower.includes('היתר') || lower.includes('רישיון') || lower.includes('permit') || lower.includes('license')) {
    return 'permit';
  }
  if (lower.includes('שימור') || lower.includes('תיק תיעוד') || lower.includes('conservation') || lower.includes('preservation')) {
    return 'preservation';
  }
  if (lower.includes('חזית') || lower.includes('facade')) {
    return 'facade';
  }
  if (lower.includes('טאבו') || lower.includes('חלוקה') || lower.includes('תשריט') || lower.includes('גוש') || lower.includes('cadastral') || lower.includes('parcel')) {
    return 'cadastral';
  }
  if (
    mimeType.startsWith('image/') ||
    lower.includes('תמונה') ||
    lower.includes('צילום') ||
    lower.includes('photo')
  ) {
    return 'photo';
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
  'id,name,mimeType,webViewLink,webContentLink,thumbnailLink,iconLink,size,createdTime,modifiedTime,description,shortcutDetails';

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

  const walk = async (id: string, path: string[], depth: number) => {
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
        files.push({ ...c, id: c.shortcutDetails.targetId, mimeType: c.shortcutDetails.targetMimeType, folderPath: path });
      } else {
        files.push({ ...c, folderPath: path });
      }
    }
    // Walk sub-folders a few at a time
    for (let i = 0; i < subfolders.length; i += 4) {
      await Promise.all(subfolders.slice(i, i + 4).map((f) => walk(f.id, [...path, f.name], depth + 1)));
    }
  };

  try {
    await walk(folderId, [], 0);
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
