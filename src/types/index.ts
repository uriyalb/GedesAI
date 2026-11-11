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

export interface GeotaggedDocument {
  id: string;
  title: string;
  titleHe: string;
  category: DocumentCategory;
  address: string;
  addressHe: string;
  buildingNumber: number;
  coordinates: GeotagCoordinates;
  year: number;
  dateStr: string;
  architect?: string;
  architectHe?: string;
  fileId?: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  fileSize?: string;
  mimeType?: string;
  description: string;
  descriptionHe: string;
  gushHelka?: string; // גוש וחלקה
  permitNumber?: string;
  isDriveSynced?: boolean;
}

export interface BuildingPlot {
  id: string;
  number: number;
  street: string;
  streetHe: string;
  centerCoordinates: GeotagCoordinates;
  height: number;
  levels: number;
  yearBuilt: number;
  architect: string;
  architectHe: string;
  style: 'Bauhaus / International' | 'Eclectic' | 'Modernist';
  descriptionHe: string;
  preservationStatus: 'Strict' | 'Standard' | 'Documented';
  width: number;
  depth: number;
  rotation: number; // degrees
  hasCurvedBalcony?: boolean;
  hasPilotis?: boolean;
  hasRoofPergola?: boolean;
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
