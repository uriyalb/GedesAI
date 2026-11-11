import React, { useEffect, useRef } from 'react';
import { ChissinSceneManager, PhotoMarker, ThumbnailLoader } from './SceneManager.ts';
import { BuildingPlot, GeotaggedDocument, ViewPreset } from '../../types/index.ts';
import { Crosshair, X } from 'lucide-react';

interface MapCanvasProps {
  buildings: BuildingPlot[];
  documents: GeotaggedDocument[];
  selectedBuilding: BuildingPlot | null;
  onSelectBuilding: (building: BuildingPlot | null) => void;
  photoMarkers: PhotoMarker[];
  loadPhotoThumb: ThumbnailLoader;
  onSelectPhoto: (docId: string) => void;
  /** When true, the next tap on the map picks a location instead of selecting. */
  pickMode: boolean;
  onPickPoint: (lat: number, lng: number, y: number) => void;
  onCancelPick: () => void;
  viewPreset: ViewPreset;
  showTrees: boolean;
  isArchitecturalMode: boolean;
  sceneManagerRef: React.MutableRefObject<ChissinSceneManager | null>;
  lang: 'he' | 'en';
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  buildings,
  documents,
  selectedBuilding,
  onSelectBuilding,
  photoMarkers,
  loadPhotoThumb,
  onSelectPhoto,
  pickMode,
  onPickPoint,
  onCancelPick,
  viewPreset,
  showTrees,
  isArchitecturalMode,
  sceneManagerRef,
  lang,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const cb = useRef({ onSelectBuilding, onSelectPhoto, onPickPoint });
  cb.current = { onSelectBuilding, onSelectPhoto, onPickPoint };
  const isHe = lang === 'he';

  // Initialize SceneManager once on mount
  useEffect(() => {
    if (!mountRef.current) return;

    const manager = new ChissinSceneManager(mountRef.current, {
      onSelectBuilding: (b) => cb.current.onSelectBuilding(b),
      onSelectPhoto: (id) => cb.current.onSelectPhoto(id),
      onGeotagPickPoint: (lat, lng, y) => cb.current.onPickPoint(lat, lng, y),
    });

    sceneManagerRef.current = manager;
    manager.setBuildings(buildings);
    manager.setDocuments(documents);
    manager.setPhotoMarkers(photoMarkers, loadPhotoThumb);

    return () => {
      manager.dispose();
      sceneManagerRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneManagerRef.current?.setBuildings(buildings);
  }, [buildings]);

  useEffect(() => {
    sceneManagerRef.current?.setDocuments(documents);
  }, [documents]);

  useEffect(() => {
    sceneManagerRef.current?.setPhotoMarkers(photoMarkers, loadPhotoThumb);
  }, [photoMarkers]);

  useEffect(() => {
    sceneManagerRef.current?.setGeotagMode(pickMode);
  }, [pickMode]);

  useEffect(() => {
    sceneManagerRef.current?.setViewPreset(viewPreset);
  }, [viewPreset]);

  useEffect(() => {
    sceneManagerRef.current?.toggleTrees(showTrees);
  }, [showTrees]);

  useEffect(() => {
    sceneManagerRef.current?.toggleArchitecturalMode(isArchitecturalMode);
  }, [isArchitecturalMode]);

  // Highlight the selected building without hijacking the camera
  useEffect(() => {
    sceneManagerRef.current?.selectBuilding(selectedBuilding);
  }, [selectedBuilding]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-100">
      <div ref={mountRef} className="w-full h-full" style={{ touchAction: 'none' }} data-testid="threejs-map-canvas" />

      {pickMode && (
        <div className="absolute top-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-20 flex items-center gap-3 bg-amber-500 text-slate-950 ps-4 pe-2 py-2 rounded-2xl shadow-2xl border-2 border-amber-300">
          <Crosshair className="w-5 h-5 shrink-0" />
          <span className="font-semibold text-sm flex-1">
            {isHe
              ? 'הקש על המקום שבו צולמה התמונה (על הקרקע, או על גג / מרפסת)'
              : 'Tap where the photo was taken (ground, or a roof / balcony)'}
          </span>
          <button
            onClick={onCancelPick}
            className="p-1.5 rounded-lg hover:bg-amber-400 shrink-0"
            aria-label={isHe ? 'ביטול' : 'Cancel'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
