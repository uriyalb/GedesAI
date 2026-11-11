export type DocumentCategory =
  | 'permit'          // היתר בנייה
  | 'architectural'   // תכנית אדריכלית
  | 'preservation'    // תיק שימור
  | 'cadastral'       // תשריט חלוקה/טאבו
  | 'photo'           // צילום היסטורי
  | 'facade';         // תכנית חזיתות

export interface GeotagCoordinates {
  lat: number;
  lng: number;
  elevation?: number; // Y height in 3D scene
}

/** How a document was linked to a building. */
export type DocumentMatchSource = 'filename' | 'folder' | 'gush-helka' | 'manual';

export interface GeotaggedDocument {
  id: string;
  title: string;
  titleHe: string;
  category: DocumentCategory;
  address: string;
  addressHe: string;
  /** Primary house number (legacy, kept for filtering). 0 when unknown. */
  buildingNumber: number;
  /** Primary building (OSM envelope id) the document is linked to. Undefined = not linked yet. */
  buildingId?: string;
  /** All buildings referenced by the document (e.g. a corner plan covering two addresses). */
  buildingIds?: string[];
  matchedBy?: DocumentMatchSource;
  /** Public space / plan area the document describes when it isn't about a single building. */
  areaHe?: string;
  areaEn?: string;
  coordinates: GeotagCoordinates;
  /** Year mentioned in the file name, 0 when unknown. */
  year: number;
  dateStr: string;
  architect?: string;
  architectHe?: string;
  fileId?: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  fileSize?: string;
  mimeType?: string;
  /** Sub-folder path inside the shared Drive folder, e.g. "חיסין 20/היתרים". */
  drivePath?: string;
  description: string;
  descriptionHe: string;
  gushHelka?: string; // גוש וחלקה
  permitNumber?: string;
  isDriveSynced?: boolean;
  /** Where a photo was taken: from the image's GPS data (EXIF) or tagged manually on the map. */
  photoLocation?: PhotoLocation;
  /** The signed-in user can edit the Drive file (and therefore tag it on the map). */
  canEdit?: boolean;
  /** The file is inside the shared collection folder. */
  inCollection?: boolean;
}

export interface PhotoLocation {
  lat: number;
  lng: number;
  /** Metres above sea level of the camera; undefined = at eye level above the ground. */
  altitude?: number;
  source: 'exif' | 'manual';
}

export interface BuildingAddress {
  /** Street name as stored in the municipal GIS (e.g. "לוין שמריהו"). */
  street: string;
  /** Display name in Hebrew (e.g. "שמריהו לוין"). */
  streetHe: string;
  streetEn: string;
  number: number;
  /** Entrance / sub-number letter, e.g. "א" for 24א. */
  entrance: string;
  gush: number | null;
  helka: number | null;
}

export interface BuildingPreservation {
  type: string;   // e.g. "שימור - בינלאומי"
  plan: string;   // e.g. 2650ב
  strict: boolean;
  note: string;
}

export interface BuildingPlot {
  /** OSM envelope id – unique per building. */
  id: string;
  addresses: BuildingAddress[];
  /** Primary display address, e.g. "חיסין 20". */
  titleHe: string;
  titleEn: string;
  /** Primary house number (0 if none). */
  number: number;
  street: string;
  streetHe: string;
  name?: string;
  /** Building type from the GIS when it isn't a regular building (e.g. "תחנת אוטובוס"). */
  kind?: string;
  /** Footprint polygons, each [outer ring, ...holes] of [lat, lng]. */
  polygons: [number, number][][][];
  /** Ground elevation under the building relative to the scene origin (m). */
  baseElevation: number;
  /** Open ground floor on columns (pilotis). */
  pilotis: boolean;
  centerCoordinates: GeotagCoordinates;
  height: number;
  levels: number;
  yearBuilt: number | null;
  preservation?: BuildingPreservation;
  /** True when one of the building's addresses is on Chissin street. */
  isChissin: boolean;
}

export interface FilterOptions {
  searchQuery: string;
  category: DocumentCategory | 'all';
  buildingNumber: number | 'all';
  yearMin: number;
  yearMax: number;
  onlyDriveFiles: boolean;
}

export type ViewPreset = 'overview' | 'street' | 'topDown' | 'habimaView' | 'dizengoffView';
