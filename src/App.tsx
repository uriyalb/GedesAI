import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout, getAccessToken } from './services/auth.ts';
import { fetchDriveFolderFiles, DriveFileItem, TARGET_FOLDER_ID, inferCategoryFromFilename, extractBuildingNumber, formatBytes } from './services/drive.ts';
import { CHISSIN_BUILDINGS, INITIAL_GEOTAGGED_DOCUMENTS } from './data/chissinData.ts';
import { BuildingPlot, GeotaggedDocument, DocumentCategory, ViewPreset } from './types/index.ts';
import { filterDocuments } from './utils/geo.ts';
import { MapCanvas } from './components/Map3D/MapCanvas.tsx';
import { ChissinSceneManager } from './components/Map3D/SceneManager.ts';
import { Navbar } from './components/UI/Navbar.tsx';
import { BottomDock } from './components/UI/BottomDock.tsx';
import { DocumentDrawer } from './components/UI/DocumentDrawer.tsx';
import { DocumentViewerModal } from './components/UI/DocumentViewerModal.tsx';
import { GeotagModal } from './components/UI/GeotagModal.tsx';
import { AerialReferenceModal } from './components/UI/AerialReferenceModal.tsx';
import { BuildingInfoCard } from './components/UI/BuildingInfoCard.tsx';

export default function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [hasDriveToken, setHasDriveToken] = useState<boolean>(false);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isSyncingDrive, setIsSyncingDrive] = useState<boolean>(false);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);

  // Language state: 'he' (Hebrew) default as requested by user, 'en' available
  const [lang, setLang] = useState<'he' | 'en'>('he');

  // Map & Data state
  const [buildings] = useState<BuildingPlot[]>(CHISSIN_BUILDINGS);
  const [documents, setDocuments] = useState<GeotaggedDocument[]>(INITIAL_GEOTAGGED_DOCUMENTS);
  const [selectedDoc, setSelectedDoc] = useState<GeotaggedDocument | null>(null);
  const [viewingDoc, setViewingDoc] = useState<GeotaggedDocument | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingPlot | null>(null);

  // Filters & Controls state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | 'all'>('all');
  const [viewPreset, setViewPreset] = useState<ViewPreset>('overview');
  const [showTrees, setShowTrees] = useState<boolean>(true);
  const [isArchitecturalMode, setIsArchitecturalMode] = useState<boolean>(false);

  // Modals & Panels state
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isGeotagModalOpen, setIsGeotagModalOpen] = useState<boolean>(false);
  const [isAerialModalOpen, setIsAerialModalOpen] = useState<boolean>(false);
  const [isGeotagMode, setIsGeotagMode] = useState<boolean>(false);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number; elevation?: number } | null>(null);

  const sceneManagerRef = useRef<ChissinSceneManager | null>(null);

  // 1. Initialize Firebase Auth listener on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setHasDriveToken(!!token);
        // Automatically fetch files from Google Drive folder on successful auth
        loadDriveFiles();
      },
      () => {
        setUser(null);
        setHasDriveToken(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Fetch files from user's Google Drive folder
  const loadDriveFiles = async () => {
    setIsSyncingDrive(true);
    setDriveMessage(null);
    try {
      const res = await fetchDriveFolderFiles(TARGET_FOLDER_ID);
      if (res.files && res.files.length > 0) {
        setDriveFiles(res.files);

        // Automatically ensure every file from Google Drive is geotagged as a 3D pin on the map
        setDocuments((prevDocs) => {
          const existingFileIds = new Set(prevDocs.map((d) => d.fileId || d.id));
          const existingTitles = new Set(prevDocs.map((d) => d.title.toLowerCase()));
          const newDriveDocs: GeotaggedDocument[] = [];

          res.files.forEach((file, idx) => {
            if (existingFileIds.has(file.id) || existingTitles.has(file.name.toLowerCase())) {
              return;
            }

            const bNum = extractBuildingNumber(file.name) || (buildings[idx % buildings.length].number);
            const matchedBuilding =
              buildings.find((b) => b.number === bNum) || buildings[idx % buildings.length];
            const category = inferCategoryFromFilename(file.name);

            newDriveDocs.push({
              id: `drive-${file.id}`,
              title: file.name,
              titleHe: file.name.replace(/\.[^/.]+$/, ''),
              category,
              address: `${matchedBuilding.number} Chissin St, Tel Aviv`,
              addressHe: `רחוב חיסין ${matchedBuilding.number}, תל אביב`,
              buildingNumber: matchedBuilding.number,
              coordinates: {
                lat: matchedBuilding.centerCoordinates.lat,
                lng: matchedBuilding.centerCoordinates.lng,
                elevation: matchedBuilding.height + 2.5,
              },
              year: 1936,
              dateStr: file.createdTime ? file.createdTime.split('T')[0] : '1936-05-15',
              architect: matchedBuilding.architect,
              architectHe: matchedBuilding.architectHe,
              fileId: file.id,
              driveUrl: file.webViewLink || `https://drive.google.com/drive/u/0/folders/${TARGET_FOLDER_ID}`,
              thumbnailUrl: file.thumbnailLink,
              fileSize: formatBytes(file.size),
              mimeType: file.mimeType,
              description: file.description || `Document synced from Google Drive folder: ${file.name}`,
              descriptionHe: file.description || `מסמך מקושר ומסונכרן מתיקיית Google Drive: ${file.name}`,
              isDriveSynced: true,
            });
          });

          return [...newDriveDocs, ...prevDocs];
        });

        setDriveMessage(
          lang === 'he'
            ? `סונכרנו ותויגו ${res.files.length} מסמכים מתיקיית Google Drive על גבי המפה!`
            : `Synced and tagged ${res.files.length} documents from Google Drive on the map!`
        );
      } else if (res.error) {
        setDriveMessage(res.error);
      }
    } catch (e: any) {
      console.warn('Drive loading notice:', e);
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const handleLogin = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setHasDriveToken(true);
        loadDriveFiles();
      }
    } catch (err: any) {
      console.error('Sign-in failed:', err);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setHasDriveToken(false);
    setDriveFiles([]);
  };

  // 3. Filtered documents based on active category & search
  const filteredDocs = useMemo(() => {
    return filterDocuments(documents, {
      searchQuery,
      category: selectedCategory,
      buildingNumber: 'all',
      yearMin: 1920,
      yearMax: 2026,
      onlyDriveFiles: false,
    });
  }, [documents, searchQuery, selectedCategory]);

  // 4. Handle Geotagging a new document
  const handleSaveGeotaggedDocument = (newDoc: GeotaggedDocument) => {
    setDocuments((prev) => [newDoc, ...prev]);
    setSelectedDoc(newDoc);
    setViewingDoc(newDoc);
    setDriveMessage(
      lang === 'he'
        ? `המסמך "${newDoc.titleHe}" נדקר בהצלחה בכתובת ${newDoc.addressHe}!`
        : `Document "${newDoc.title}" pinned successfully at ${newDoc.address}!`
    );
  };

  // 5. Handle user clicking on 3D map during Geotag Pick Mode
  const handleGeotagPickPoint = (lat: number, lng: number, elevation: number) => {
    setPickedCoords({ lat, lng, elevation });
    setIsGeotagMode(false);
    setIsGeotagModalOpen(true);
  };

  return (
    <div
      className="relative w-screen h-screen overflow-hidden font-sans text-slate-100"
      dir={lang === 'he' ? 'rtl' : 'ltr'}
    >
      {/* Top Navigation Bar */}
      <Navbar
        user={user}
        hasDriveToken={hasDriveToken}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onOpenGeotagModal={() => setIsGeotagModalOpen(true)}
        onToggleDrawer={() => setIsDrawerOpen(!isDrawerOpen)}
        isDrawerOpen={isDrawerOpen}
        docCount={documents.length}
        onSyncDrive={loadDriveFiles}
        isSyncing={isSyncingDrive}
        onOpenAerialReference={() => setIsAerialModalOpen(true)}
        lang={lang}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
      />

      {/* Main 3D WebGL Map Viewport */}
      <main className="w-full h-full pt-16">
        <MapCanvas
          buildings={buildings}
          documents={filteredDocs}
          selectedDoc={selectedDoc}
          selectedBuilding={selectedBuilding}
          onSelectDoc={(doc) => {
            setSelectedDoc(doc);
            if (doc) setViewingDoc(doc);
          }}
          onSelectBuilding={(b) => setSelectedBuilding(b)}
          isGeotagMode={isGeotagMode}
          onGeotagPickPoint={handleGeotagPickPoint}
          viewPreset={viewPreset}
          showTrees={showTrees}
          isArchitecturalMode={isArchitecturalMode}
          sceneManagerRef={sceneManagerRef}
        />
      </main>

      {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <BottomDock
        currentView={viewPreset}
        onSelectView={(v) => setViewPreset(v)}
        selectedCategory={selectedCategory}
        onSelectCategory={(cat) => setSelectedCategory(cat)}
        showTrees={showTrees}
        onToggleTrees={() => setShowTrees(!showTrees)}
        isArchitecturalMode={isArchitecturalMode}
        onToggleArchitectural={() => setIsArchitecturalMode(!isArchitecturalMode)}
        isGeotagMode={isGeotagMode}
        onToggleGeotagMode={() => setIsGeotagMode(!isGeotagMode)}
        lang={lang}
      />

      {/* Document Drawer List */}
      <DocumentDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        documents={filteredDocs}
        selectedDoc={selectedDoc}
        onSelectDoc={(doc) => {
          setSelectedDoc(doc);
          sceneManagerRef.current?.focusDocument(doc);
        }}
        onOpenViewer={(doc) => setViewingDoc(doc)}
        searchQuery={searchQuery}
        onSearchChange={(q) => setSearchQuery(q)}
        selectedCategory={selectedCategory}
        onCategoryChange={(cat) => setSelectedCategory(cat)}
        onOpenGeotagModal={() => setIsGeotagModalOpen(true)}
        lang={lang}
      />

      {/* Deep Document Viewer Modal */}
      {viewingDoc && (
        <DocumentViewerModal
          document={viewingDoc}
          onClose={() => setViewingDoc(null)}
          lang={lang}
        />
      )}

      {/* Authentic Building Envelope Info Card */}
      {selectedBuilding && (
        <BuildingInfoCard
          building={selectedBuilding}
          associatedDocs={documents.filter(
            (d) =>
              d.buildingNumber === selectedBuilding.number ||
              (selectedBuilding.streetHe.includes('חיסין') &&
                d.addressHe.includes(selectedBuilding.number.toString()))
          )}
          onClose={() => setSelectedBuilding(null)}
          onGeotagOnBuilding={(b) => {
            setPickedCoords({
              lat: b.centerCoordinates.lat,
              lng: b.centerCoordinates.lng,
              elevation: b.height + 2,
            });
            setIsGeotagModalOpen(true);
          }}
          onSelectDoc={(doc) => {
            setSelectedDoc(doc);
            setViewingDoc(doc);
            sceneManagerRef.current?.focusDocument(doc);
          }}
          lang={lang}
        />
      )}

      {/* Geotag New Document Modal */}
      {isGeotagModalOpen && (
        <GeotagModal
          isOpen={isGeotagModalOpen}
          onClose={() => {
            setIsGeotagModalOpen(false);
            setPickedCoords(null);
          }}
          onSaveDocument={handleSaveGeotaggedDocument}
          buildings={buildings}
          driveFiles={driveFiles}
          prefilledCoords={pickedCoords}
          onStartClickToPin={() => setIsGeotagMode(true)}
          lang={lang}
        />
      )}

      {/* Real Aerial Photogrammetry Reference Modal (Simplex 3D / Technion) */}
      <AerialReferenceModal
        isOpen={isAerialModalOpen}
        onClose={() => setIsAerialModalOpen(false)}
        lang={lang}
      />

      {/* Notification Toast */}
      {driveMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-md">
          <span className="text-xs">{driveMessage}</span>
          <button
            onClick={() => setDriveMessage(null)}
            className="text-slate-400 hover:text-white text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
