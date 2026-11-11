import React, { useEffect, useMemo, useState } from 'react';
import { BuildingPlot, GeotaggedDocument } from '../../types/index.ts';
import {
  downloadDriveFile,
  drivePreviewUrl,
  driveViewUrl,
  isGoogleNative,
  DriveAuthError,
} from '../../services/drive.ts';
import { PdfViewer } from './PdfViewer.tsx';
import { BuildingPicker } from './BuildingPicker.tsx';
import {
  X,
  ExternalLink,
  Download,
  ZoomIn,
  ZoomOut,
  Loader2,
  Building2,
  Info,
  FolderOpen,
  AlertTriangle,
  Trees,
  Link2,
} from 'lucide-react';

interface DocumentViewerModalProps {
  document: GeotaggedDocument;
  buildings: BuildingPlot[];
  isSignedIn: boolean;
  onLogin: () => void;
  onClose: () => void;
  onShowBuilding: (b: BuildingPlot) => void;
  onAssign: (doc: GeotaggedDocument, buildingId: string | null) => void;
  lang: 'he' | 'en';
}

type Mode = 'native' | 'drive';
type Kind = 'pdf' | 'image' | 'text' | 'other';

function kindOf(mime?: string): Kind {
  if (!mime) return 'other';
  if (mime === 'application/pdf' || isGoogleNative(mime)) return 'pdf';
  if (/^image\/(jpeg|png|gif|webp|bmp|svg\+xml|avif)$/.test(mime)) return 'image';
  if (mime.startsWith('text/')) return 'text';
  return 'other';
}

const MATCH_LABEL_HE: Record<string, string> = {
  filename: 'לפי הכתובת בשם הקובץ',
  folder: 'לפי שם התיקייה',
  'gush-helka': 'לפי גוש וחלקה',
  manual: 'שיוך ידני',
};
const MATCH_LABEL_EN: Record<string, string> = {
  filename: 'address in file name',
  folder: 'folder name',
  'gush-helka': 'block / parcel',
  manual: 'manual',
};

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  document: doc,
  buildings,
  isSignedIn,
  onLogin,
  onClose,
  onShowBuilding,
  onAssign,
  lang,
}) => {
  const isHe = lang === 'he';
  const kind = kindOf(doc.mimeType);
  const canRenderNatively = !!doc.fileId && kind !== 'other';
  const [mode, setMode] = useState<Mode>(canRenderNatively && isSignedIn ? 'native' : 'drive');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showInfo, setShowInfo] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const linkedBuildings = useMemo(
    () => (doc.buildingIds ?? []).map((id) => buildings.find((b) => b.id === id)).filter(Boolean) as BuildingPlot[],
    [doc.buildingIds, buildings]
  );

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Download the file for in-app viewing
  useEffect(() => {
    setBlob(null);
    setText(null);
    setError(null);
    setZoom(1);
    if (mode !== 'native' || !doc.fileId || !isSignedIn) return;
    const ctrl = new AbortController();
    setLoading(true);
    downloadDriveFile(doc.fileId, doc.mimeType, ctrl.signal)
      .then(async (b) => {
        if (kind === 'text') setText(await b.text());
        setBlob(b);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof DriveAuthError) {
          setError(isHe ? 'פג תוקף ההתחברות ל-Google. התחבר מחדש.' : 'Google sign-in expired. Please sign in again.');
        } else {
          setError(e?.message || String(e));
        }
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [doc.fileId, mode, isSignedIn]);

  const objectUrl = useMemo(() => (blob && kind === 'image' ? URL.createObjectURL(blob) : null), [blob, kind]);
  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const handleDownload = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = isGoogleNative(doc.mimeType) ? `${doc.title}.pdf` : doc.title;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const openUrl = doc.fileId ? driveViewUrl(doc.fileId) : doc.driveUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-slate-950/85 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full sm:max-w-6xl h-[100dvh] sm:h-[92vh] bg-slate-900 sm:border border-slate-700/80 sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-2 px-3 sm:px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 border-b border-slate-800">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white leading-snug line-clamp-2 break-words">
              {isHe ? doc.titleHe : doc.title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              {linkedBuildings.length > 0 ? (
                linkedBuildings.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onShowBuilding(b)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25"
                  >
                    <Building2 className="w-3 h-3" />
                    {isHe ? b.titleHe : b.titleEn}
                  </button>
                ))
              ) : doc.areaHe ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  <Trees className="w-3 h-3" />
                  {isHe ? doc.areaHe : doc.areaEn}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <AlertTriangle className="w-3 h-3" />
                  {isHe ? 'לא משויך למבנה' : 'Not linked to a building'}
                </span>
              )}
              {doc.year > 0 && <span className="text-slate-400">{doc.year}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 -m-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 shrink-0"
            aria-label={isHe ? 'סגור' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-3 sm:px-4 py-2 border-b border-slate-800 bg-slate-950/40 overflow-x-auto scrollbar-none">
          {doc.fileId && (
            <div className="flex rounded-lg border border-slate-700 overflow-hidden shrink-0 text-xs">
              <button
                onClick={() => setMode('native')}
                disabled={!canRenderNatively}
                className={`px-2.5 py-1.5 ${mode === 'native' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'} disabled:opacity-40`}
              >
                {isHe ? 'תצוגה' : 'Viewer'}
              </button>
              <button
                onClick={() => setMode('drive')}
                className={`px-2.5 py-1.5 ${mode === 'drive' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                Google Drive
              </button>
            </div>
          )}
          {mode === 'native' && (kind === 'pdf' || kind === 'image') && blob && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[11px] text-slate-400 w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex-1" />
          <button
            onClick={() => setShowInfo((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs shrink-0 border ${
              showInfo ? 'bg-slate-800 border-blue-500 text-blue-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>{isHe ? 'פרטים' : 'Details'}</span>
          </button>
          {blob && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs shrink-0 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isHe ? 'הורדה' : 'Download'}</span>
            </button>
          )}
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs shrink-0 bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isHe ? 'פתח בלשונית חדשה' : 'Open in new tab'}</span>
            </a>
          )}
        </div>

        {/* Details panel */}
        {showInfo && (
          <div className="px-3 sm:px-4 py-3 border-b border-slate-800 bg-slate-900 text-xs space-y-2 max-h-[45%] overflow-y-auto">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              {doc.drivePath && (
                <>
                  <dt className="text-slate-400">{isHe ? 'תיקייה' : 'Folder'}</dt>
                  <dd className="text-slate-200 flex items-center gap-1 min-w-0">
                    <FolderOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{doc.drivePath}</span>
                  </dd>
                </>
              )}
              {doc.mimeType && (
                <>
                  <dt className="text-slate-400">{isHe ? 'סוג' : 'Type'}</dt>
                  <dd className="text-slate-200 font-mono break-all" dir="ltr">
                    {doc.mimeType}
                    {doc.fileSize ? ` · ${doc.fileSize}` : ''}
                  </dd>
                </>
              )}
              {doc.dateStr && (
                <>
                  <dt className="text-slate-400">{isHe ? 'עודכן' : 'Modified'}</dt>
                  <dd className="text-slate-200"><bdi>{doc.dateStr}</bdi></dd>
                </>
              )}
              {doc.gushHelka && (
                <>
                  <dt className="text-slate-400">{isHe ? 'גוש/חלקה' : 'Block/parcel'}</dt>
                  <dd className="text-slate-200">{doc.gushHelka}</dd>
                </>
              )}
              <dt className="text-slate-400">{isHe ? 'שיוך' : 'Linked by'}</dt>
              <dd className="text-slate-200">
                {doc.matchedBy
                  ? (isHe ? MATCH_LABEL_HE : MATCH_LABEL_EN)[doc.matchedBy]
                  : isHe
                  ? 'לא נמצאה כתובת בשם הקובץ או התיקייה'
                  : 'No address found in the file or folder name'}
              </dd>
            </dl>
            {doc.descriptionHe && <p className="text-slate-300 leading-relaxed">{doc.descriptionHe}</p>}
            {doc.fileId && (
              <button
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
              >
                <Link2 className="w-3.5 h-3.5" />
                {isHe ? 'שנה שיוך למבנה' : 'Change linked building'}
              </button>
            )}
          </div>
        )}

        {/* Viewer */}
        <div className="relative flex-1 min-h-0 bg-slate-950 overflow-auto overscroll-contain">
          {!doc.fileId ? (
            <EmptyState text={isHe ? 'למסמך זה אין קובץ מקושר.' : 'This document has no attached file.'} />
          ) : mode === 'drive' ? (
            <>
              <iframe
                key={doc.fileId}
                src={drivePreviewUrl(doc.fileId)}
                title={doc.title}
                className="absolute inset-0 w-full h-full border-0 bg-white"
                allow="autoplay; fullscreen"
              />
              {!isSignedIn && (
                <div className="absolute bottom-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 bg-slate-900/95 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 shadow-xl flex items-center gap-3">
                  <span className="flex-1">
                    {isHe
                      ? 'אם המסמך לא מוצג, התחבר עם חשבון Google שיש לו גישה לתיקייה.'
                      : "If the file doesn't load, sign in with a Google account that can access the folder."}
                  </span>
                  <button onClick={onLogin} className="px-3 py-1.5 bg-white text-slate-900 rounded-lg font-semibold shrink-0">
                    {isHe ? 'התחבר' : 'Sign in'}
                  </button>
                </div>
              )}
            </>
          ) : loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-7 h-7 animate-spin" />
              <span>{isHe ? 'טוען את המסמך מ-Google Drive…' : 'Loading from Google Drive…'}</span>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
              <p className="text-sm text-slate-300 max-w-md">{error}</p>
              <div className="flex gap-2">
                <button onClick={() => setMode('drive')} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs">
                  {isHe ? 'הצג דרך Google Drive' : 'Show via Google Drive'}
                </button>
                {!isSignedIn && (
                  <button onClick={onLogin} className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs">
                    {isHe ? 'התחבר' : 'Sign in'}
                  </button>
                )}
              </div>
            </div>
          ) : blob && kind === 'pdf' ? (
            <div className="p-2">
              <PdfViewer data={blob} zoom={zoom} onError={(e) => setError(e.message)} />
            </div>
          ) : objectUrl ? (
            <div className="p-2 flex justify-center" style={{ minWidth: `${zoom * 100}%` }}>
              <img
                src={objectUrl}
                alt={doc.title}
                className="block h-auto shadow-lg"
                style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
              />
            </div>
          ) : text !== null ? (
            <pre className="p-4 text-xs text-slate-200 whitespace-pre-wrap break-words" dir="auto">
              {text}
            </pre>
          ) : null}
        </div>

        {pickerOpen && (
          <BuildingPicker
            buildings={buildings}
            lang={lang}
            title={isHe ? `שיוך "${doc.titleHe}" למבנה` : `Link "${doc.title}" to a building`}
            onClose={() => setPickerOpen(false)}
            onPick={(b) => {
              onAssign(doc, b ? b.id : null);
              setPickerOpen(false);
            }}
            allowClear={doc.matchedBy === 'manual'}
          />
        )}
      </div>
    </div>
  );
};

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-400">{text}</div>
);
