import React, { useEffect, useMemo, useState } from 'react';
import { GeotaggedDocument, PhotoLocation } from '../../types/index.ts';
import { DriveFileItem, searchDriveImages } from '../../services/drive.ts';
import { photoLocationOf } from '../../services/documents.ts';
import { ALL_BUILDINGS } from '../../data/buildings.ts';
import { latLngToWorld } from '../../utils/geo.ts';
import { groundHeight, toSeaLevel } from '../../utils/terrain.ts';
import { X, Search, Camera, MapPin, Crosshair, Loader2, Satellite, Trash2, ChevronLeft, ChevronRight, LogIn } from 'lucide-react';

export interface PhotoCandidate {
  fileId: string;
  name: string;
  thumbnailUrl?: string;
  mimeType?: string;
  location?: PhotoLocation;
  /** Present when the photo is already one of the app's documents. */
  docId?: string;
  driveFile?: DriveFileItem;
}

export function candidateFromDoc(d: GeotaggedDocument): PhotoCandidate {
  return {
    fileId: d.fileId!,
    name: d.titleHe,
    thumbnailUrl: d.thumbnailUrl,
    mimeType: d.mimeType,
    location: d.photoLocation,
    docId: d.id,
  };
}

function candidateFromFile(f: DriveFileItem): PhotoCandidate {
  return {
    fileId: f.id,
    name: f.name.replace(/\.[^/.]{1,5}$/, ''),
    thumbnailUrl: f.thumbnailLink,
    mimeType: f.mimeType,
    location: photoLocationOf(f),
    driveFile: f,
  };
}

export interface PickedPoint {
  lat: number;
  lng: number;
  /** Scene height of the picked eye position. */
  y: number;
}

interface PhotoTagModalProps {
  documents: GeotaggedDocument[];
  initial?: PhotoCandidate | null;
  picked: PickedPoint | null;
  hidden: boolean;
  isSignedIn: boolean;
  onLogin: () => void;
  onPickOnMap: () => void;
  onSave: (photo: PhotoCandidate, loc: { lat: number; lng: number; altitude: number }) => Promise<void>;
  onRemove: (photo: PhotoCandidate) => Promise<void>;
  onClose: () => void;
  lang: 'he' | 'en';
}

const EYE = 1.6;

function nearestBuildingTitle(lat: number, lng: number, isHe: boolean): string {
  let best = '';
  let bd = Infinity;
  for (const b of ALL_BUILDINGS) {
    if (!b.addresses.length) continue;
    const d = Math.hypot((b.centerCoordinates.lat - lat) * 111320, (b.centerCoordinates.lng - lng) * 94330);
    if (d < bd) {
      bd = d;
      best = isHe ? b.titleHe : b.titleEn;
    }
  }
  return bd < 80 ? best : '';
}

export const PhotoTagModal: React.FC<PhotoTagModalProps> = ({
  documents,
  initial,
  picked,
  hidden,
  isSignedIn,
  onLogin,
  onPickOnMap,
  onSave,
  onRemove,
  onClose,
  lang,
}) => {
  const isHe = lang === 'he';
  const Back = isHe ? ChevronRight : ChevronLeft;
  const [photo, setPhoto] = useState<PhotoCandidate | null>(initial ?? null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<DriveFileItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [heightAbove, setHeightAbove] = useState(EYE);
  const [fromGps, setFromGps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collectionPhotos = useMemo(
    () => documents.filter((d) => d.fileId && d.inCollection && d.mimeType?.startsWith('image/')),
    [documents]
  );
  const collectionIds = useMemo(() => new Set(collectionPhotos.map((d) => d.fileId)), [collectionPhotos]);

  // Initialise the location when a photo is chosen
  useEffect(() => {
    setError(null);
    if (!photo?.location) {
      setPoint(null);
      setFromGps(false);
      setHeightAbove(EYE);
      return;
    }
    const { lat, lng, altitude, source } = photo.location;
    setPoint({ lat, lng });
    setFromGps(source === 'exif');
    const w = latLngToWorld(lat, lng);
    const groundSea = toSeaLevel(groundHeight(w.x, w.z));
    const above = altitude !== undefined ? altitude - groundSea : EYE;
    setHeightAbove(Math.max(0, Math.min(120, Math.round(above * 10) / 10)));
  }, [photo]);

  // A point picked on the map
  useEffect(() => {
    if (!picked) return;
    const w = latLngToWorld(picked.lat, picked.lng);
    setPoint({ lat: picked.lat, lng: picked.lng });
    setFromGps(false);
    setHeightAbove(Math.max(0, Math.round((picked.y - groundHeight(w.x, w.z)) * 10) / 10));
  }, [picked]);

  // Search the user's Drive for images
  useEffect(() => {
    if (!isSignedIn || photo) return;
    if (!q.trim()) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchDriveImages(q));
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q, isSignedIn, photo]);

  const handleSave = async () => {
    if (!photo || !point) return;
    const w = latLngToWorld(point.lat, point.lng);
    setBusy(true);
    setError(null);
    try {
      await onSave(photo, { ...point, altitude: toSeaLevel(groundHeight(w.x, w.z)) + heightAbove });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!photo) return;
    setBusy(true);
    setError(null);
    try {
      await onRemove(photo);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const near = point ? nearestBuildingTitle(point.lat, point.lng, isHe) : '';

  return (
    <div
      className={`fixed inset-0 z-50 items-end sm:items-center justify-center bg-slate-950/70 sm:p-4 ${hidden ? 'hidden' : 'flex'}`}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92dvh] bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col text-slate-100"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-2 p-3 border-b border-slate-800">
          {photo && !initial && (
            <button
              onClick={() => setPhoto(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              aria-label={isHe ? 'חזרה' : 'Back'}
            >
              <Back className="w-4 h-4" />
            </button>
          )}
          <Camera className="w-5 h-5 text-amber-400 shrink-0" />
          <h2 className="font-bold text-base flex-1">
            {photo ? (isHe ? 'מיקום התמונה' : 'Photo location') : isHe ? 'הוספת תמונה למפה' : 'Add a photo to the map'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isSignedIn ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-slate-300">
              {isHe ? 'כדי לבחור תמונות מ-Google Drive צריך להתחבר.' : 'Sign in to choose photos from Google Drive.'}
            </p>
            <button onClick={onLogin} className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-900 rounded-xl font-semibold text-sm">
              <LogIn className="w-4 h-4" />
              {isHe ? 'התחבר עם Google' : 'Sign in with Google'}
            </button>
          </div>
        ) : !photo ? (
          /* Step 1: choose a photo */
          <>
            <div className="p-3 border-b border-slate-800">
              <div className="relative">
                <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={isHe ? 'חיפוש תמונה בכל ה-Drive שלי…' : 'Search images in my Drive…'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl ps-9 pe-3 py-2.5 text-base sm:text-sm placeholder-slate-400 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {searching && (
                <div className="flex justify-center py-6 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}
              {results && !searching && (
                <PhotoGrid
                  title={isHe ? `תוצאות חיפוש (${results.length})` : `Search results (${results.length})`}
                  items={results.map(candidateFromFile)}
                  onPick={setPhoto}
                  empty={isHe ? 'לא נמצאו תמונות' : 'No images found'}
                  isHe={isHe}
                />
              )}
              {!results && (
                <PhotoGrid
                  title={isHe ? `תמונות מתיקיית האוסף (${collectionPhotos.length})` : `Collection photos (${collectionPhotos.length})`}
                  items={collectionPhotos.map(candidateFromDoc)}
                  onPick={setPhoto}
                  empty={
                    isHe
                      ? 'אין עדיין תמונות בתיקיית האוסף. אפשר לחפש תמונה בכל ה-Drive למעלה, או להעלות תמונות לתיקייה.'
                      : 'No photos in the collection folder yet. Search your whole Drive above, or upload photos to the folder.'
                  }
                  isHe={isHe}
                />
              )}
            </div>
          </>
        ) : (
          /* Step 2: location */
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-3">
              <Thumb url={photo.thumbnailUrl} className="w-20 h-20" />
              <div className="min-w-0">
                <div className="font-semibold text-sm break-words line-clamp-2">{photo.name}</div>
                {!collectionIds.has(photo.fileId) && (
                  <div className="text-[11px] text-amber-300 mt-1">
                    {isHe
                      ? 'התמונה מחוץ לתיקיית האוסף – יראו אותה רק מי שיש להם גישה לקובץ.'
                      : 'This photo is outside the collection folder – only people with access to the file will see it.'}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 space-y-2 text-sm">
              {point ? (
                <>
                  <div className="flex items-center gap-2">
                    {fromGps ? <Satellite className="w-4 h-4 text-emerald-400" /> : <MapPin className="w-4 h-4 text-amber-400" />}
                    <span className="font-semibold">
                      {fromGps
                        ? isHe
                          ? 'המיקום נלקח מנתוני ה-GPS שבתמונה'
                          : 'Location from the photo’s GPS data'
                        : isHe
                        ? 'מיקום שנבחר על המפה'
                        : 'Location picked on the map'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono" dir="ltr">
                    {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                  </div>
                  {near && <div className="text-xs text-slate-300">{isHe ? `ליד ${near}` : `Near ${near}`}</div>}
                </>
              ) : (
                <p className="text-slate-300">
                  {isHe
                    ? 'בתמונה אין נתוני מיקום (GPS). בחר את המקום שבו צולמה על המפה.'
                    : 'The photo has no GPS data. Pick where it was taken on the map.'}
                </p>
              )}
              <button
                onClick={onPickOnMap}
                className="w-full mt-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium flex items-center justify-center gap-2"
              >
                <Crosshair className="w-4 h-4" />
                {point ? (isHe ? 'שנה מיקום על המפה' : 'Change on the map') : isHe ? 'בחר מיקום על המפה' : 'Pick on the map'}
              </button>
            </div>

            {point && (
              <label className="block text-sm">
                <span className="flex justify-between text-slate-300 mb-1">
                  <span>{isHe ? 'גובה הצילום מעל הקרקע' : 'Camera height above ground'}</span>
                  <span className="font-mono text-amber-300">{heightAbove.toFixed(1)} m</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={0.5}
                  value={Math.min(60, heightAbove)}
                  onChange={(e) => setHeightAbove(parseFloat(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <span className="text-[11px] text-slate-500">
                  {isHe ? 'למשל 1.6 מ׳ מהרחוב, או גובה הקומה לצילום ממרפסת / גג' : 'e.g. 1.6 m from the street, or the floor height for a balcony / roof'}
                </span>
              </label>
            )}

            {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!point || busy}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-sm flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                {isHe ? 'דקור על המפה' : 'Pin on the map'}
              </button>
              {photo.location?.source === 'manual' && (
                <button
                  onClick={handleRemove}
                  disabled={busy}
                  className="px-3 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  {isHe ? 'הסר' : 'Remove'}
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {isHe
                ? 'המיקום נשמר על קובץ התמונה ב-Google Drive, כך שכל מי שיש לו גישה לתמונה יראה אותה על המפה. בפעם הראשונה Google יבקש הרשאה לעריכת קבצים.'
                : 'The location is saved on the image file in Google Drive, so everyone with access sees it on the map. The first time, Google will ask for permission to edit files.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const Thumb: React.FC<{ url?: string; className?: string }> = ({ url, className = '' }) => {
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} rounded-lg object-cover bg-slate-700 shrink-0`}
    />
  ) : (
    <span className={`${className} rounded-lg bg-slate-700 flex items-center justify-center shrink-0`}>
      <Camera className="w-5 h-5 text-slate-400" />
    </span>
  );
};

const PhotoGrid: React.FC<{
  title: string;
  items: PhotoCandidate[];
  onPick: (p: PhotoCandidate) => void;
  empty: string;
  isHe: boolean;
}> = ({ title, items, onPick, empty, isHe }) => (
  <div>
    <div className="text-xs font-semibold text-slate-400 mb-2">{title}</div>
    {items.length === 0 ? (
      <p className="text-sm text-slate-400 py-4">{empty}</p>
    ) : (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {items.map((p) => (
          <button key={p.fileId} onClick={() => onPick(p)} className="text-start group" title={p.name}>
            <div className="relative">
              <Thumb url={p.thumbnailUrl} className="w-full aspect-square" />
              {p.location && (
                <span className="absolute top-1 start-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900/85 text-amber-300">
                  📍 {p.location.source === 'exif' ? 'GPS' : isHe ? 'מתויג' : 'tagged'}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-300 truncate mt-1 group-hover:text-white">{p.name}</div>
          </button>
        ))}
      </div>
    )}
  </div>
);
