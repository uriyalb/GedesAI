import { GeotagCoordinates, GeotaggedDocument, FilterOptions } from '../types/index.ts';

// Center reference point for Chissin Street, Tel Aviv-Yafo
// Located at Chissin Street & Chissin Garden (between King George, Dizengoff and Habima)
export const CHISSIN_CENTER = {
  lat: 32.07380,
  lng: 34.77740,
};

// Metric conversion factors for central Tel Aviv (~32.07° N)
export const METERS_PER_DEGREE_LAT = 111320;
export const METERS_PER_DEGREE_LNG = 94330; // 111320 * cos(32.07385°)

/**
 * Converts geographical WGS84 coordinates (lat, lng) to Three.js 3D space (x, z) in meters.
 * X = East (+), West (-)
 * Z = South (+), North (-) [standard WebGL/Three.js camera facing negative Z]
 */
export function latLngToWorld(lat: number, lng: number): { x: number; z: number } {
  const deltaLat = lat - CHISSIN_CENTER.lat;
  const deltaLng = lng - CHISSIN_CENTER.lng;

  const x = deltaLng * METERS_PER_DEGREE_LNG;
  const z = -deltaLat * METERS_PER_DEGREE_LAT;

  return {
    x: Number(x.toFixed(2)),
    z: Number(z.toFixed(2)),
  };
}

/**
 * Converts Three.js 3D local coordinates (x, z) back to WGS84 latitude and longitude.
 */
export function worldToLatLng(x: number, z: number): GeotagCoordinates {
  const deltaLng = x / METERS_PER_DEGREE_LNG;
  const deltaLat = -z / METERS_PER_DEGREE_LAT;

  return {
    lat: Number((CHISSIN_CENTER.lat + deltaLat).toFixed(6)),
    lng: Number((CHISSIN_CENTER.lng + deltaLng).toFixed(6)),
  };
}

/**
 * Calculates distance in meters between two geographical coordinates (Haversine formula).
 */
export function calculateDistanceMeters(
  coord1: GeotagCoordinates,
  coord2: GeotagCoordinates
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const lat1 = (coord1.lat * Math.PI) / 180;
  const lat2 = (coord2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Validates whether coordinates fall inside the greater Chissin / Lev Tel Aviv block area.
 */
export function isWithinChissinBlock(lat: number, lng: number): boolean {
  return (
    lat >= 32.068 &&
    lat <= 32.079 &&
    lng >= 34.768 &&
    lng <= 34.781
  );
}

/**
 * Formats coordinates into clean user-facing string (e.g., 32°04'25.8"N 34°46'29.5"E)
 */
export function formatCoordinatesDMS(lat: number, lng: number): string {
  const toDMS = (deg: number, isLat: boolean) => {
    const absolute = Math.abs(deg);
    const degrees = Math.floor(absolute);
    const minutesNotTruncated = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesNotTruncated);
    const seconds = Math.floor((minutesNotTruncated - minutes) * 60);
    const direction = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
    return `${degrees}°${minutes}'${seconds}"${direction}`;
  };

  return `${toDMS(lat, true)} ${toDMS(lng, false)}`;
}

/**
 * Filters a list of geotagged documents based on search, category, building, year, and sync state.
 */
export function filterDocuments(
  docs: GeotaggedDocument[],
  filters: FilterOptions
): GeotaggedDocument[] {
  return docs.filter((doc) => {
    // Search query matches title (EN/HE), address, architect, or description
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      const match =
        doc.title.toLowerCase().includes(q) ||
        doc.titleHe.toLowerCase().includes(q) ||
        doc.address.toLowerCase().includes(q) ||
        doc.addressHe.toLowerCase().includes(q) ||
        (doc.architect && doc.architect.toLowerCase().includes(q)) ||
        (doc.architectHe && doc.architectHe.toLowerCase().includes(q)) ||
        (doc.permitNumber && doc.permitNumber.toLowerCase().includes(q)) ||
        doc.description.toLowerCase().includes(q) ||
        doc.descriptionHe.toLowerCase().includes(q);
      if (!match) return false;
    }

    // Category filter
    if (filters.category !== 'all' && doc.category !== filters.category) {
      return false;
    }

    // Building number filter
    if (filters.buildingNumber !== 'all' && doc.buildingNumber !== filters.buildingNumber) {
      return false;
    }

    // Year range
    if (doc.year < filters.yearMin || doc.year > filters.yearMax) {
      return false;
    }

    // Google Drive only
    if (filters.onlyDriveFiles && !doc.isDriveSynced && !doc.driveUrl) {
      return false;
    }

    return true;
  });
}
