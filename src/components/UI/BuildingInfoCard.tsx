import React, { useMemo, useState } from 'react';
import { BuildingPlot, GeotaggedDocument } from '../../types/index.ts';
import { normalizeText } from '../../utils/addressMatch.ts';
import {
  Building2,
  Calendar,
  Layers,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  Award,
  MapPinned,
  Link2,
  Search,
  Image as ImageIcon,
  LogIn,
  Loader2,
} from 'lucide-react';

interface BuildingInfoCardProps {
  building: BuildingPlot;
  associatedDocs: GeotaggedDocument[];
  allDocs: GeotaggedDocument[];
  isSignedIn: boolean;
  isSyncing: boolean;
  onLogin: () => void;
  onClose: () => void;
  onOpenDoc: (doc: GeotaggedDocument) => void;
  onAssignDoc: (doc: GeotaggedDocument, buildingId: string) => void;
  lang: 'he' | 'en';
}

export const BuildingInfoCard: React.FC<BuildingInfoCardProps> = ({
  building,
  associatedDocs,
  allDocs,
  isSignedIn,
  isSyncing,
  onLogin,
  onClose,
  onOpenDoc,
  onAssignDoc,
  lang,
}) => {
  const isHe = lang === 'he';
  const [pickerOpen, setPickerOpen] = useState(false);
  const Chevron = isHe ? ChevronLeft : ChevronRight;

  const parcels = useMemo(() => {
    const set = new Set<string>();
    building.addresses.forEach((a) => a.gush && a.helka && set.add(`${a.gush}/${a.helka}`));
    return [...set];
  }, [building]);

  const otherAddresses = building.addresses.slice(1);

  return (
    <>
      <div
        className={`fixed z-30 bg-slate-900/95 backdrop-blur-xl border-sky-500/30 shadow-2xl flex flex-col overflow-hidden
          inset-x-0 bottom-0 max-h-[62dvh] rounded-t-2xl border-t
          sm:inset-x-auto sm:bottom-auto sm:top-20 sm:w-96 sm:max-h-[calc(100dvh-7rem)] sm:rounded-2xl sm:border
          ${isHe ? 'sm:left-4' : 'sm:right-4'}`}
        role="dialog"
        aria-label={isHe ? building.titleHe : building.titleEn}
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-2">
          <span className="w-10 h-1 rounded-full bg-slate-600" />
        </div>

        {/* Header */}
        <div className="relative bg-gradient-to-r from-sky-950 via-slate-900 to-indigo-950 px-4 pt-3 pb-3 border-b border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-white leading-tight break-words">
                {isHe ? building.titleHe : building.titleEn}
              </h3>
              {otherAddresses.length > 0 && (
                <div className="text-xs text-slate-300 mt-0.5">
                  {isHe ? 'גם: ' : 'Also: '}
                  {otherAddresses.map((a) => `${isHe ? a.streetHe : a.streetEn} ${a.number}${a.entrance}`).join(' · ')}
                </div>
              )}
              <div className="text-[11px] text-slate-400 mt-0.5">{isHe ? 'תל אביב-יפו' : 'Tel Aviv-Yafo'}</div>
            </div>
            <button
              onClick={onClose}
              className="p-2 -m-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 shrink-0"
              aria-label={isHe ? 'סגור' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {building.preservation && (
            <div
              className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                building.preservation.strict
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>
                {building.preservation.type}
                {building.preservation.strict ? (isHe ? ' · הגבלות מחמירות' : ' · strict') : ''}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3 text-sm pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Specs */}
          <div className="grid grid-cols-3 gap-2">
            <Spec icon={<Calendar className="w-3.5 h-3.5 text-sky-400" />} label={isHe ? 'שנת בנייה' : 'Built'}>
              {building.yearBuilt ?? '—'}
            </Spec>
            <Spec icon={<Layers className="w-3.5 h-3.5 text-sky-400" />} label={isHe ? 'קומות' : 'Floors'}>
              {building.levels}
              <span className="text-slate-400 text-xs font-normal"> · {Math.round(building.height)}m</span>
            </Spec>
            <Spec icon={<MapPinned className="w-3.5 h-3.5 text-sky-400" />} label={isHe ? 'גוש/חלקה' : 'Parcel'}>
              <span className="text-xs">{parcels.length ? parcels.join(', ') : '—'}</span>
            </Spec>
          </div>

          {building.preservation?.note && (
            <p className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-xs text-slate-300 leading-relaxed">
              {building.preservation.note}
            </p>
          )}

          {/* Documents */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-sky-400" />
                {isHe ? 'מסמכים מקושרים' : 'Linked documents'} ({associatedDocs.length})
              </span>
              {isSyncing && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
            </div>

            {!isSignedIn && associatedDocs.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs text-slate-300 space-y-2">
                <p>
                  {isHe
                    ? 'המסמכים נטענים מתיקיית Google Drive המשותפת. התחבר עם חשבון Google שיש לו גישה לתיקייה כדי לראות אותם.'
                    : 'Documents are loaded from the shared Google Drive folder. Sign in with a Google account that can access it.'}
                </p>
                <button
                  onClick={onLogin}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-900 rounded-lg font-semibold"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  {isHe ? 'התחבר עם Google' : 'Sign in with Google'}
                </button>
              </div>
            ) : associatedDocs.length === 0 ? (
              <p className="text-xs text-slate-500 py-1">
                {isHe ? 'לא נמצאו בתיקייה מסמכים עם כתובת זו.' : 'No documents with this address were found in the folder.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {associatedDocs.map((doc) => (
                  <li key={doc.id}>
                    <button
                      onClick={() => onOpenDoc(doc)}
                      className="w-full text-start p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 active:bg-slate-700 border border-slate-700/50 flex items-center gap-2.5 text-xs transition-colors group"
                    >
                      <DocThumb doc={doc} />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-slate-200 group-hover:text-sky-300 line-clamp-2 break-words">
                          {isHe ? doc.titleHe : doc.title}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                          {[doc.year || null, doc.drivePath || null, doc.fileSize || null]
                            .filter(Boolean)
                            .map((part, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && ' · '}
                                <bdi>{part}</bdi>
                              </React.Fragment>
                            ))}
                        </span>
                      </div>
                      <Chevron className="w-4 h-4 text-slate-500 group-hover:text-sky-400 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isSignedIn && allDocs.length > 0 && (
            <button
              onClick={() => setPickerOpen(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-2"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>{isHe ? 'שייך מסמך מהתיקייה למבנה זה' : 'Link a folder document to this building'}</span>
            </button>
          )}
        </div>
      </div>

      {pickerOpen && (
        <DocumentPicker
          docs={allDocs}
          lang={lang}
          title={isHe ? `שיוך מסמך ל${building.titleHe}` : `Link a document to ${building.titleEn}`}
          onClose={() => setPickerOpen(false)}
          onPick={(doc) => {
            onAssignDoc(doc, building.id);
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
};

const Spec: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/50 min-w-0">
    <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-0.5">
      {icon}
      <span className="truncate">{label}</span>
    </div>
    <div className="font-semibold text-slate-200 truncate">{children}</div>
  </div>
);

export const DocThumb: React.FC<{ doc: GeotaggedDocument }> = ({ doc }) => {
  const [failed, setFailed] = useState(false);
  if (doc.thumbnailUrl && !failed) {
    return (
      <img
        src={doc.thumbnailUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-10 h-10 rounded-lg object-cover bg-slate-700 shrink-0"
      />
    );
  }
  const Icon = doc.mimeType?.startsWith('image/') ? ImageIcon : FileText;
  return (
    <span className="w-10 h-10 rounded-lg bg-slate-700/70 flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4 text-slate-300" />
    </span>
  );
};

const DocumentPicker: React.FC<{
  docs: GeotaggedDocument[];
  title: string;
  onPick: (d: GeotaggedDocument) => void;
  onClose: () => void;
  lang: 'he' | 'en';
}> = ({ docs, title, onPick, onClose, lang }) => {
  const isHe = lang === 'he';
  const [q, setQ] = useState('');
  const [onlyUnlinked, setOnlyUnlinked] = useState(true);
  const results = useMemo(() => {
    const nq = normalizeText(q);
    return docs.filter(
      (d) =>
        (!onlyUnlinked || !d.buildingId) &&
        (!nq || nq.split(' ').every((t) => normalizeText(`${d.titleHe} ${d.drivePath ?? ''}`).includes(t)))
    );
  }, [docs, q, onlyUnlinked]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-950/70 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[80dvh] bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 p-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white line-clamp-2">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 border-b border-slate-800 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isHe ? 'חיפוש לפי שם קובץ או תיקייה' : 'Search file or folder name'}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl ps-9 pe-3 py-2.5 text-base sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={onlyUnlinked} onChange={(e) => setOnlyUnlinked(e.target.checked)} />
            {isHe ? 'הצג רק מסמכים שלא שויכו' : 'Only unlinked documents'}
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {results.map((d) => (
            <button
              key={d.id}
              onClick={() => onPick(d)}
              className="w-full flex items-center gap-2.5 p-2 rounded-xl text-start hover:bg-slate-800"
            >
              <DocThumb doc={d} />
              <div className="min-w-0">
                <div className="text-sm text-slate-100 line-clamp-2 break-words">{d.titleHe}</div>
                <div className="text-[11px] text-slate-400 truncate">{d.addressHe || d.drivePath}</div>
              </div>
            </button>
          ))}
          {results.length === 0 && (
            <p className="p-4 text-center text-sm text-slate-400">{isHe ? 'לא נמצאו מסמכים' : 'No documents found'}</p>
          )}
        </div>
      </div>
    </div>
  );
};
