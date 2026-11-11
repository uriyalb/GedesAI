import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout, getAccessToken } from './services/auth.ts';
import { fetchDriveFolderFiles, DriveFileItem, TARGET_FOLDER_ID } from './services/drive.ts';
import {
  driveFileToDocument,
  documentBelongsTo,
  loadAssignments,
  saveAssignments,
  ManualAssignments,
} from './services/documents.ts';
import { ALL_BUILDINGS, BUILDINGS_BY_ID } from './data/buildings.ts';
import { BuildingPlot, GeotaggedDocument, DocumentCategory, ViewPreset } from './types/index.ts';
import { filterDocuments } from './utils/geo.ts';
import { MapCanvas } from './components/Map3D/MapCanvas.tsx';
import { ChissinSceneManager } from './components/Map3D/SceneManager.ts';
import { Navbar } from './components/UI/Navbar.tsx';
import { BottomDock } from './components/UI/BottomDock.tsx';
import { DocumentDrawer } from './components/UI/DocumentDrawer.tsx';
import { DocumentViewerModal } from './components/UI/DocumentViewerModal.tsx';
import { AerialReferenceModal } from './components/UI/AerialReferenceModal.tsx';
import { BuildingInfoCard } from './components/UI/BuildingInfoCard.tsx';

const isMobileViewport = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

function signInErrorMessage(err: any, isHe: boolean): string | null {
  const code: string = err?.code || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
  if (code === 'auth/unauthorized-domain') {
    return isHe
      ? `הדומיין ${window.location.hostname} אינו מאושר להתחברות. יש להוסיף אותו ב-Firebase Console › Authentication › Settings › Authorized domains.`
      : `${window.location.hostname} is not authorized for sign-in. Add it in Firebase Console › Authentication › Settings › Authorized domains.`;
  }
  if (code === 'auth/popup-blocked') {
    return isHe ? 'הדפדפן חסם את חלון ההתחברות. אפשר חלונות קופצים ונסה שוב.' : 'The sign-in popup was blocked. Allow popups and try again.';
  }
  return (isHe ? 'ההתחברות נכשלה: ' : 'Sign-in failed: ') + (err?.message || code);
}

export default function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [hasDriveToken, setHasDriveToken] = useState<boolean>(!!getAccessToken());
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isSyncingDrive, setIsSyncingDrive] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  // Language state: Hebrew by default
  const [lang, setLang] = useState<'he' | 'en'>('he');
  const isHe = lang === 'he';

  // Map & data state
  const buildings = ALL_BUILDINGS;
  const [assignments, setAssignments] = useState<ManualAssignments>(() => loadAssignments());
  const [viewingDoc, setViewingDoc] = useState<GeotaggedDocument | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingPlot | null>(null);

  // Filters & controls
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | 'all'>('all');
  const [viewPreset, setViewPreset] = useState<ViewPreset>('overview');
  const [showTrees, setShowTrees] = useState<boolean>(true);
  const [isArchitecturalMode, setIsArchitecturalMode] = useState<boolean>(false);

  // Panels
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isAerialModalOpen, setIsAerialModalOpen] = useState<boolean>(false);

  const sceneManagerRef = useRef<ChissinSceneManager | null>(null);
  const langRef = useRef(lang);
  langRef.current = lang;

  // Fetch every file in the shared Google Drive folder (including sub-folders)
  const loadDriveFiles = useCallback(async () => {
    setIsSyncingDrive(true);
    try {
      const res = await fetchDriveFolderFiles(TARGET_FOLDER_ID);
      const he = langRef.current === 'he';
      if (res.needsAuth) {
        setHasDriveToken(false);
        setMessage(he ? 'פג תוקף ההתחברות ל-Google Drive. התחבר מחדש כדי לטעון את המסמכים.' : 'Your Google Drive session expired. Sign in again to load documents.');
        return;
      }
      setDriveFiles(res.files);
      if (res.error) {
        setMessage(
          (he ? 'שגיאה בטעינת התיקייה: ' : 'Error loading the folder: ') +
            res.error +
            (he ? ' — ודא שלחשבון יש גישה לתיקייה.' : ' — make sure this account can access the folder.')
        );
      } else if (res.files.length === 0) {
        setMessage(he ? 'התיקייה ריקה או שאין לחשבון זה גישה אליה.' : 'The folder is empty or this account has no access to it.');
      }
    } finally {
      setIsSyncingDrive(false);
    }
  }, []);

  // Firebase auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser) => {
        setUser(currentUser);
        setHasDriveToken(true);
        loadDriveFiles();
      },
      (currentUser) => {
        setUser(currentUser);
        setHasDriveToken(false);
      }
    );
    return () => unsubscribe();
  }, [loadDriveFiles]);

  const handleLogin = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setHasDriveToken(true);
        setMessage(null);
        loadDriveFiles();
      }
    } catch (err: any) {
      console.error('Sign-in failed:', err);
      const msg = signInErrorMessage(err, isHe);
      if (msg) setMessage(msg);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setHasDriveToken(false);
    setDriveFiles([]);
    setViewingDoc(null);
  };

  // Drive files → documents linked to buildings
  const documents = useMemo(
    () => driveFiles.map((f) => driveFileToDocument(f, assignments)),
    [driveFiles, assignments]
  );

  const filteredDocs = useMemo(
    () =>
      filterDocuments(documents, {
        searchQuery,
        category: selectedCategory,
        buildingNumber: 'all',
        yearMin: 1800,
        yearMax: 2100,
        onlyDriveFiles: false,
      }),
    [documents, searchQuery, selectedCategory]
  );

  const buildingDocs = useMemo(
    () => (selectedBuilding ? documents.filter((d) => documentBelongsTo(d, selectedBuilding.id)) : []),
    [documents, selectedBuilding]
  );

  // Keep the open viewer in sync after (re)assigning a document
  useEffect(() => {
    if (viewingDoc) {
      const updated = documents.find((d) => d.id === viewingDoc.id);
      if (updated && updated !== viewingDoc) setViewingDoc(updated);
    }
  }, [documents]);

  const handleAssign = (doc: GeotaggedDocument, buildingId: string | null) => {
    if (!doc.fileId) return;
    setAssignments((prev) => {
      const next = { ...prev };
      if (buildingId) next[doc.fileId!] = buildingId;
      else delete next[doc.fileId!];
      saveAssignments(next);
      return next;
    });
    if (buildingId) {
      const b = BUILDINGS_BY_ID.get(buildingId);
      if (b) setMessage(isHe ? `"${doc.titleHe}" שויך ל${b.titleHe}` : `"${doc.title}" linked to ${b.titleEn}`);
    }
  };

  const showBuilding = (b: BuildingPlot) => {
    setSelectedBuilding(b);
    sceneManagerRef.current?.focusBuilding(b);
  };

  return (
    <div
      className="relative w-full h-[100dvh] overflow-hidden font-sans text-slate-100 bg-slate-900"
      dir={isHe ? 'rtl' : 'ltr'}
    >
      <Navbar
        user={user}
        hasDriveToken={hasDriveToken}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onToggleDrawer={() => setIsDrawerOpen(!isDrawerOpen)}
        isDrawerOpen={isDrawerOpen}
        docCount={documents.length}
        onSyncDrive={loadDriveFiles}
        isSyncing={isSyncingDrive}
        onOpenAerialReference={() => setIsAerialModalOpen(true)}
        lang={lang}
        onToggleLang={() => setLang(isHe ? 'en' : 'he')}
      />

      {/* 3D map */}
      <main className="w-full h-full pt-[calc(3.5rem+env(safe-area-inset-top))] sm:pt-[calc(4rem+env(safe-area-inset-top))]">
        <MapCanvas
          buildings={buildings}
          documents={filteredDocs}
          selectedBuilding={selectedBuilding}
          onSelectBuilding={(b) => {
            setSelectedBuilding(b);
            if (b && isMobileViewport()) setIsDrawerOpen(false);
          }}
          viewPreset={viewPreset}
          showTrees={showTrees}
          isArchitecturalMode={isArchitecturalMode}
          sceneManagerRef={sceneManagerRef}
        />
      </main>

      <BottomDock
        currentView={viewPreset}
        onSelectView={(v) => setViewPreset(v)}
        selectedCategory={selectedCategory}
        onSelectCategory={(cat) => setSelectedCategory(cat)}
        showTrees={showTrees}
        onToggleTrees={() => setShowTrees(!showTrees)}
        isArchitecturalMode={isArchitecturalMode}
        onToggleArchitectural={() => setIsArchitecturalMode(!isArchitecturalMode)}
        hidden={!!selectedBuilding}
        lang={lang}
      />

      <DocumentDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        documents={filteredDocs}
        selectedDoc={viewingDoc}
        onLocateDoc={(doc) => {
          const b = doc.buildingId ? BUILDINGS_BY_ID.get(doc.buildingId) : undefined;
          if (b) {
            showBuilding(b);
            if (isMobileViewport()) setIsDrawerOpen(false);
          }
        }}
        onOpenViewer={(doc) => setViewingDoc(doc)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        isSignedIn={hasDriveToken}
        isSyncing={isSyncingDrive}
        onLogin={handleLogin}
        onSync={loadDriveFiles}
        lang={lang}
      />

      {selectedBuilding && (
        <BuildingInfoCard
          key={selectedBuilding.id}
          building={selectedBuilding}
          associatedDocs={buildingDocs}
          allDocs={documents}
          isSignedIn={hasDriveToken}
          isSyncing={isSyncingDrive}
          onLogin={handleLogin}
          onClose={() => setSelectedBuilding(null)}
          onOpenDoc={(doc) => setViewingDoc(doc)}
          onAssignDoc={(doc, id) => handleAssign(doc, id)}
          lang={lang}
        />
      )}

      {viewingDoc && (
        <DocumentViewerModal
          document={viewingDoc}
          buildings={buildings}
          isSignedIn={hasDriveToken}
          onLogin={handleLogin}
          onClose={() => setViewingDoc(null)}
          onShowBuilding={(b) => {
            setViewingDoc(null);
            setIsDrawerOpen(false);
            showBuilding(b);
          }}
          onAssign={handleAssign}
          lang={lang}
        />
      )}

      <AerialReferenceModal isOpen={isAerialModalOpen} onClose={() => setIsAerialModalOpen(false)} lang={lang} />

      {message && (
        <div className="fixed top-[calc(4rem+env(safe-area-inset-top))] sm:top-20 inset-x-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-w-xl z-[45] bg-slate-900/95 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-start gap-3 backdrop-blur-md">
          <span className="text-xs leading-relaxed flex-1">{message}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white text-sm font-bold px-1" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
