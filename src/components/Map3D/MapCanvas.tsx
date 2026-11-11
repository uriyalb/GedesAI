import React, { useEffect, useRef } from 'react';
import { ChissinSceneManager } from './SceneManager.ts';
import { BuildingPlot, GeotaggedDocument, ViewPreset } from '../../types/index.ts';

interface MapCanvasProps {
  buildings: BuildingPlot[];
  documents: GeotaggedDocument[];
  selectedBuilding: BuildingPlot | null;
  onSelectBuilding: (building: BuildingPlot | null) => void;
  viewPreset: ViewPreset;
  showTrees: boolean;
  isArchitecturalMode: boolean;
  sceneManagerRef: React.MutableRefObject<ChissinSceneManager | null>;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  buildings,
  documents,
  selectedBuilding,
  onSelectBuilding,
  viewPreset,
  showTrees,
  isArchitecturalMode,
  sceneManagerRef,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectBuilding);
  onSelectRef.current = onSelectBuilding;

  // Initialize SceneManager once on mount
  useEffect(() => {
    if (!mountRef.current) return;

    const manager = new ChissinSceneManager(mountRef.current, {
      onSelectBuilding: (b) => onSelectRef.current(b),
    });

    sceneManagerRef.current = manager;
    manager.setBuildings(buildings);
    manager.setDocuments(documents);

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
    </div>
  );
};
