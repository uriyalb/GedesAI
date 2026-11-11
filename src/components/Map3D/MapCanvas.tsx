import React, { useEffect, useRef, useState } from 'react';
import { ChissinSceneManager } from './SceneManager.ts';
import { BuildingPlot, GeotaggedDocument, ViewPreset } from '../../types/index.ts';
import { formatCoordinatesDMS } from '../../utils/geo.ts';
import { MapPin, Crosshair, Compass, Eye, Layers } from 'lucide-react';

interface MapCanvasProps {
  buildings: BuildingPlot[];
  documents: GeotaggedDocument[];
  selectedDoc: GeotaggedDocument | null;
  selectedBuilding: BuildingPlot | null;
  onSelectDoc: (doc: GeotaggedDocument | null) => void;
  onSelectBuilding: (building: BuildingPlot | null) => void;
  isGeotagMode: boolean;
  onGeotagPickPoint: (lat: number, lng: number, elevation: number) => void;
  viewPreset: ViewPreset;
  showTrees: boolean;
  isArchitecturalMode: boolean;
  sceneManagerRef: React.MutableRefObject<ChissinSceneManager | null>;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  buildings,
  documents,
  selectedDoc,
  selectedBuilding,
  onSelectDoc,
  onSelectBuilding,
  isGeotagMode,
  onGeotagPickPoint,
  viewPreset,
  showTrees,
  isArchitecturalMode,
  sceneManagerRef,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredDoc, setHoveredDoc] = useState<GeotaggedDocument | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Initialize SceneManager once on mount
  useEffect(() => {
    if (!mountRef.current) return;

    const manager = new ChissinSceneManager(mountRef.current, {
      onSelectDocument: (doc) => onSelectDoc(doc),
      onHoverDocument: (doc, pos) => {
        setHoveredDoc(doc);
        if (pos) setHoverPos(pos);
      },
      onSelectBuilding: (b) => onSelectBuilding(b),
      onGeotagPickPoint: (lat, lng, elev) => onGeotagPickPoint(lat, lng, elev),
    });

    sceneManagerRef.current = manager;
    manager.setBuildings(buildings);
    manager.setDocuments(documents);

    return () => {
      manager.dispose();
      sceneManagerRef.current = null;
    };
  }, []);

  // Sync buildings and documents when updated
  useEffect(() => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setBuildings(buildings);
    }
  }, [buildings]);

  useEffect(() => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setDocuments(documents);
    }
  }, [documents]);

  // Sync camera when viewPreset changes
  useEffect(() => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setViewPreset(viewPreset);
    }
  }, [viewPreset]);

  // Sync geotag mode
  useEffect(() => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setGeotagMode(isGeotagMode);
    }
  }, [isGeotagMode]);

  // Sync toggles
  useEffect(() => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.toggleTrees(showTrees);
    }
  }, [showTrees]);

  useEffect(() => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.toggleArchitecturalMode(isArchitecturalMode);
    }
  }, [isArchitecturalMode]);

  // Sync selected document focus
  useEffect(() => {
    if (selectedDoc && sceneManagerRef.current) {
      sceneManagerRef.current.focusDocument(selectedDoc);
    }
  }, [selectedDoc]);

  // Highlight selected building without hijacking camera zoom
  useEffect(() => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.selectBuilding(selectedBuilding);
    }
  }, [selectedBuilding]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-100">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        className="w-full h-full"
        style={{ touchAction: 'none' }}
        data-testid="threejs-map-canvas"
      />

      {/* Geotag Mode Crosshair Banner */}
      {isGeotagMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="flex items-center gap-3 bg-amber-500 text-slate-950 px-5 py-2.5 rounded-full shadow-2xl border-2 border-amber-300 animate-bounce">
            <Crosshair className="w-5 h-5 animate-spin" />
            <span className="font-semibold text-sm">
              לחץ על גג מבנה או נקודה בקרקע להצבת נעץ גאוגרפי
            </span>
            <span className="text-xs opacity-75 font-mono">
              (Click on any building or ground to geotag)
            </span>
          </div>
        </div>
      )}

      {/* Floating Hover Tooltip for 3D Document Pin */}
      {hoveredDoc && hoverPos && !isGeotagMode && (
        <div
          className="fixed pointer-events-none z-30 transition-transform duration-75"
          style={{
            left: `${hoverPos.x + 16}px`,
            top: `${hoverPos.y - 12}px`,
          }}
        >
          <div className="bg-slate-900/95 text-white p-3.5 rounded-xl shadow-2xl border border-slate-700/80 max-w-xs backdrop-blur-md">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">
                {hoveredDoc.category}
              </span>
              <span className="text-xs text-slate-400 mr-auto font-mono">
                {hoveredDoc.year}
              </span>
            </div>
            <h4 className="font-bold text-sm text-slate-100 line-clamp-1">
              {hoveredDoc.titleHe}
            </h4>
            <p className="text-xs text-slate-300 mb-1.5">{hoveredDoc.addressHe}</p>
            <div className="text-[10px] text-cyan-300 font-mono bg-slate-800/80 px-2 py-1 rounded">
              📍 {formatCoordinatesDMS(hoveredDoc.coordinates.lat, hoveredDoc.coordinates.lng)}
            </div>
          </div>
        </div>
      )}

      {/* Map Controls Compass & Legend Info Overlay */}
      <div className="absolute top-20 right-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="bg-slate-900/80 text-white/90 p-2.5 rounded-xl border border-slate-700/60 shadow-lg backdrop-blur-sm pointer-events-auto flex items-center gap-2.5 text-xs font-medium">
          <Compass className="w-4 h-4 text-sky-400" />
          <span>רחוב חיסין (Hassin St) • 32.0738° N</span>
        </div>
      </div>
    </div>
  );
};
