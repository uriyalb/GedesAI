import React, { useMemo, useState } from 'react';
import { BuildingPlot } from '../../types/index.ts';
import { normalizeText } from '../../utils/addressMatch.ts';
import { Search, X, Building2, Unlink } from 'lucide-react';

interface BuildingPickerProps {
  buildings: BuildingPlot[];
  title: string;
  onPick: (b: BuildingPlot | null) => void;
  onClose: () => void;
  allowClear?: boolean;
  lang: 'he' | 'en';
}

/** Searchable list of all buildings by address. */
export const BuildingPicker: React.FC<BuildingPickerProps> = ({ buildings, title, onPick, onClose, allowClear, lang }) => {
  const isHe = lang === 'he';
  const [q, setQ] = useState('');

  const sorted = useMemo(
    () =>
      [...buildings].sort(
        (a, b) =>
          Number(b.isChissin) - Number(a.isChissin) ||
          a.streetHe.localeCompare(b.streetHe, 'he') ||
          a.number - b.number
      ),
    [buildings]
  );

  const results = useMemo(() => {
    const nq = normalizeText(q);
    if (!nq) return sorted;
    return sorted.filter((b) => {
      const hay = normalizeText(
        [b.titleHe, b.titleEn, ...b.addresses.map((a) => `${a.street} ${a.number}${a.entrance} ${a.gush ?? ''} ${a.helka ?? ''}`)].join(' ')
      );
      return nq.split(' ').every((t) => hay.includes(t));
    });
  }, [q, sorted]);

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
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isHe ? 'חיפוש כתובת, למשל "חיסין 20"' : 'Search address, e.g. "Chissin 20"'}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl ps-9 pe-3 py-2.5 text-base sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {allowClear && (
            <button
              onClick={() => onPick(null)}
              className="w-full flex items-center gap-2 p-2.5 rounded-xl text-start text-sm text-amber-300 hover:bg-slate-800"
            >
              <Unlink className="w-4 h-4" />
              {isHe ? 'בטל שיוך ידני (חזור לזיהוי אוטומטי)' : 'Remove manual link (use automatic matching)'}
            </button>
          )}
          {results.slice(0, 200).map((b) => (
            <button
              key={b.id}
              onClick={() => onPick(b)}
              className="w-full flex items-center gap-2 p-2.5 rounded-xl text-start hover:bg-slate-800"
            >
              <Building2 className={`w-4 h-4 shrink-0 ${b.isChissin ? 'text-sky-400' : 'text-slate-500'}`} />
              <div className="min-w-0">
                <div className="text-sm text-slate-100 truncate">{isHe ? b.titleHe : b.titleEn}</div>
                {b.addresses.length > 1 && (
                  <div className="text-[11px] text-slate-400 truncate">
                    {b.addresses.map((a) => `${isHe ? a.streetHe : a.streetEn} ${a.number}${a.entrance}`).join(' · ')}
                  </div>
                )}
              </div>
            </button>
          ))}
          {results.length === 0 && (
            <p className="p-4 text-center text-sm text-slate-400">{isHe ? 'לא נמצאו מבנים' : 'No buildings found'}</p>
          )}
        </div>
      </div>
    </div>
  );
};
