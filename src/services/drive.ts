import { getAccessToken } from './auth.ts';
import { GeotaggedDocument, DocumentCategory } from '../types/index.ts';

export const TARGET_FOLDER_ID = '1h-QXqwpMGGOIjGzZEll8ZszRyCJvN2w1';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  description?: string;
  iconLink?: string;
}

/**
 * Categorize a file based on its name or MIME type
 */
export function inferCategoryFromFilename(name: string): DocumentCategory {
  const lower = name.toLowerCase();
  if (lower.includes('היתר') || lower.includes('permit') || lower.includes('license')) {
    return 'permit';
  }
  if (lower.includes('תכנית') || lower.includes('plan') || lower.includes('blueprint') || lower.includes('section') || lower.includes('elevation')) {
    return 'architectural';
  }
  if (lower.includes('שימור') || lower.includes('תיק') || lower.includes('conservation') || lower.includes('preservation')) {
    return 'preservation';
  }
  if (lower.includes('חזית') || lower.includes('facade')) {
    return 'facade';
  }
  if (lower.includes('טאבו') || lower.includes('חלוקה') || lower.includes('cadastral') || lower.includes('parcel')) {
    return 'cadastral';
  }
  if (lower.includes('תמונה') || lower.includes('צילום') || lower.includes('photo') || lower.includes('jpg') || lower.includes('png')) {
    return 'photo';
  }
  return 'architectural';
}

/**
 * Extracts a building number along Chissin street if present in filename
 */
export function extractBuildingNumber(name: string): number | null {
  // Looks for patterns like "חיסין 7", "חיסין-7", "chissin_7", "chissin 14", "no 14"
  const hebrewMatch = name.match(/חיסין\s*[-_]?\s*(\d{1,2})/i);
  if (hebrewMatch && hebrewMatch[1]) {
    return parseInt(hebrewMatch[1], 10);
  }
  const engMatch = name.match(/chissin\s*[-_]?\s*(\d{1,2})/i);
  if (engMatch && engMatch[1]) {
    return parseInt(engMatch[1], 10);
  }
  const genericMatch = name.match(/(?:building|בית|מס|no\.?)\s*(\d{1,2})/i);
  if (genericMatch && genericMatch[1]) {
    return parseInt(genericMatch[1], 10);
  }
  const anyNumMatch = name.match(/\b(\d{1,2})\b/);
  if (anyNumMatch && anyNumMatch[1]) {
    const num = parseInt(anyNumMatch[1], 10);
    if (num >= 1 && num <= 30) return num;
  }
  return null;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes?: string | number): string {
  if (!bytes) return 'Unknown size';
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(b) || b <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Fetches files from the user's Google Drive folder.
 */
export async function fetchDriveFolderFiles(
  folderId: string = TARGET_FOLDER_ID
): Promise<{ files: DriveFileItem[]; isLive: boolean; error?: string }> {
  const token = getAccessToken();
  if (!token) {
    return {
      files: [],
      isLive: false,
      error: 'Not authenticated with Google Drive. Sign in to view live files.',
    };
  }

  try {
    // 1. Try querying specific folder
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent(
      'files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink, size, createdTime, modifiedTime, description)'
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=50`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      console.warn('Drive folder fetch response not OK:', response.status, errJson);
      // Fallback: if folder query failed (e.g. folder belongs to another user and permissions are pending),
      // try querying user files matching "Chissin" or "חיסין" or recent files
      return await fetchDriveFallbackSearch(token);
    }

    const data = await response.json();
    const items: DriveFileItem[] = data.files || [];

    // If folder was empty, try fallback search
    if (items.length === 0) {
      return await fetchDriveFallbackSearch(token);
    }

    return { files: items, isLive: true };
  } catch (err: any) {
    console.error('Error fetching Drive files:', err);
    return {
      files: [],
      isLive: false,
      error: err.message || 'Network error fetching Google Drive files',
    };
  }
}

/**
 * Fallback search across user's Drive for any relevant files
 */
async function fetchDriveFallbackSearch(token: string): Promise<{ files: DriveFileItem[]; isLive: boolean; error?: string }> {
  try {
    const fields = encodeURIComponent(
      'files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink, size, createdTime, modifiedTime, description)'
    );
    // Search files related to Chissin or recent files
    const query = encodeURIComponent(`trashed = false and (name contains 'חיסין' or name contains 'Chissin' or mimeType contains 'pdf' or mimeType contains 'image')`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=25`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const data = await response.json();
      return { files: data.files || [], isLive: true };
    }
    return { files: [], isLive: true };
  } catch (e: any) {
    return { files: [], isLive: false, error: e.message };
  }
}
