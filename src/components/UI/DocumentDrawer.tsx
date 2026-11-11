import React, { useEffect, useMemo, useState } from 'react';
import { GeotaggedDocument, DocumentCategory } from '../../types/index.ts';
import { DocThumb } from './BuildingInfoCard.tsx';
import { TARGET_FOLDER_URL } from '../../services/drive.ts';
import { X, Search, FileText, MapPin, AlertTriangle, LogIn, Loader2, FolderOpen, RefreshCw, Trees } from 'lucide-react';

const PAGE_SIZE = 80;

interface DocumentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  documents: GeotaggedDocument[];
  selectedDoc: GeotaggedDocument | null;
  onLocateDoc: (doc: GeotaggedDocument) => void;
  onOpenViewer: (doc: GeotaggedDocument) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: DocumentCategory | 'all';
  onCategoryChange: (cat: DocumentCategory | 'all') => void;
  isSignedIn: boolean;
  isSyncing: boolean;
  onLogin: () => void;
  onSync: () => void;
  lang: 'he' | 'en';
}

const CATEGORY_LABELS: Record<DocumentCategory | 'all', { he: string; en: string; color: string }> = {
  all: { he: 'הכל', en: 'All', color: 'bg-slate-500' },
  permit: { he: 'היתרים', en: 'Permits', color: 'bg-amber-500' },
  architectural: { he: 'תכניות', en: 'Plans', color: 'bg-blue-500' },
  preservation: { he: 'שימור', en: 'Preservation', color: 'bg-emerald-500' },
  facade: { he: 'חזיתות', en: 'Facades', color: 'bg-cyan-500' },
  cadastral: { he: 'טאבו/תשריט', en: 'Cadastral', color: 'bg-purple-500' },
  photo: { he: 'צילומים', en: 'Photos', color: 'bg-pink-500' },
};

export const DocumentDrawer: React.FC<DocumentDrawerProps> = ({
  isOpen,
  onClose,
  documents,
  selectedDoc,
  onLocateDoc,
  onOpenViewer,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  isSignedIn,
  isSyncing,
  onLogin,
  onSync,
  lang,
}) => {
  const isHe = lang === 'he';
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const isUnlinked = (d: GeotaggedDocument) => !d.buildingId && !d.areaHe;
  const unlinkedCount = useMemo(() => documents.filter(isUnlinked).length, [documents]);
  const filtered = onlyUnlinked ? documents.filter(isUnlinked) : documents;
  const shown = filtered.slice(0, limit);

  // Start from the top of the list whenever the filters change
  useEffect(() => setLimit(PAGE_SIZE), [documents, onlyUnlinked]);

  if (!isOpen) return null;

  return (
    <aside
      className={`fixed top-14 sm:top-16 bottom-0 z-40 w-full sm:w-96 bg-slate-900/97 border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl flex flex-col ${
        isHe ? 'left-0 sm:border-r' : 'right-0 sm:border-l'
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-5 h-5 text-blue-400 shrink-0" />
          <h2 className="font-bold text-base text-white truncate">{isHe ? 'מסמכי התיקייה' : 'Folder documents'}</h2>
          <span className="text-xs font-semibold px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
            {documents.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isSignedIn && (
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label={isHe ? 'רענן' : 'Refresh'}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          )}
          <a
            href={TARGET_FOLDER_URL}
            target="_blank"
            rel="noreferrer"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label={isHe ? 'פתח את התיקייה ב-Drive' : 'Open folder in Drive'}
          >
            <FolderOpen className="w-4 h-4" />
          </a>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search & filters */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/40 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={isHe ? 'חיפוש לפי שם, כתובת או תיקייה…' : 'Search name, address or folder…'}
            className="w-full bg-slate-800/90 border border-slate-700 rounded-xl ps-9 pe-3 py-2 text-base sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
          {(Object.keys(CATEGORY_LABELS) as (DocumentCategory | 'all')[]).map((c) => (
            <button
              key={c}
              onClick={() => onCategoryChange(c)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs whitespace-nowrap border ${
                selectedCategory === c ? 'bg-slate-700 text-white border-blue-500' : 'bg-slate-800/60 text-slate-400 border-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${CATEGORY_LABELS[c].color}`} />
              {isHe ? CATEGORY_LABELS[c].he : CATEGORY_LABELS[c].en}
            </button>
          ))}
        </div>
        {unlinkedCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-amber-300">
            <input type="checkbox" checked={onlyUnlinked} onChange={(e) => setOnlyUnlinked(e.target.checked)} />
            {isHe ? `הצג רק מסמכים שלא שויכו למבנה (${unlinkedCount})` : `Only documents not linked to a building (${unlinkedCount})`}
          </label>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {!isSignedIn ? (
          <div className="text-center py-10 px-4 space-y-3">
            <FileText className="w-10 h-10 mx-auto text-slate-600" />
            <p className="text-sm text-slate-300">
              {isHe
                ? 'המסמכים נטענים ישירות מתיקיית Google Drive המשותפת. התחבר עם חשבון Google שיש לו גישה לתיקייה.'
                : 'Documents load directly from the shared Google Drive folder. Sign in with a Google account that can access it.'}
            </p>
            <button
              onClick={onLogin}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-900 rounded-xl font-semibold text-sm"
            >
              <LogIn className="w-4 h-4" />
              {isHe ? 'התחבר עם Google' : 'Sign in with Google'}
            </button>
          </div>
        ) : isSyncing && documents.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center py-12 px-4">
            <MapPin className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm text-slate-400">{isHe ? 'לא נמצאו מסמכים תואמים' : 'No matching documents'}</p>
          </div>
        ) : (
          <>
          {shown.map((doc) => {
            const isSelected = selectedDoc?.id === doc.id;
            return (
              <div
                key={doc.id}
                className={`p-2.5 rounded-xl border transition-all ${
                  isSelected ? 'bg-blue-950/40 border-blue-500 ring-1 ring-blue-500' : 'bg-slate-800/60 border-slate-700/80'
                }`}
              >
                <button onClick={() => onOpenViewer(doc)} className="w-full flex items-start gap-2.5 text-start">
                  <DocThumb doc={doc} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm text-slate-100 line-clamp-2 break-words">{isHe ? doc.titleHe : doc.title}</h3>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                      <span className={`w-2 h-2 rounded-full ${CATEGORY_LABELS[doc.category].color}`} />
                      <span className="text-slate-400">{isHe ? CATEGORY_LABELS[doc.category].he : CATEGORY_LABELS[doc.category].en}</span>
                      {doc.year > 0 && <span className="text-slate-500 font-mono">· {doc.year}</span>}
                    </div>
                    {doc.drivePath && <div className="text-[11px] text-slate-500 truncate mt-0.5">📁 {doc.drivePath}</div>}
                  </div>
                </button>
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-700/50 text-xs">
                  {doc.buildingId ? (
                    <button
                      onClick={() => onLocateDoc(doc)}
                      className="flex items-center gap-1 text-sky-300 hover:text-sky-200 min-w-0"
                    >
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{isHe ? doc.addressHe : doc.address}</span>
                    </button>
                  ) : doc.areaHe ? (
                    <span className="flex items-center gap-1 text-emerald-300/90 min-w-0">
                      <Trees className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{isHe ? doc.areaHe : doc.areaEn}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {isHe ? 'לא משויך למבנה' : 'Not linked'}
                    </span>
                  )}
                  <button
                    onClick={() => onOpenViewer(doc)}
                    className="px-2.5 py-1 font-semibold text-blue-200 bg-blue-600/40 hover:bg-blue-600 rounded-lg shrink-0"
                  >
                    {isHe ? 'צפה' : 'View'}
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length > shown.length && (
            <button
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              className="w-full py-2.5 rounded-xl border border-slate-700 text-sm text-slate-300 hover:bg-slate-800"
            >
              {isHe
                ? `הצג עוד (${filtered.length - shown.length} נוספים)`
                : `Show more (${filtered.length - shown.length} more)`}
            </button>
          )}
          </>
        )}
      </div>
    </aside>
  );
};
