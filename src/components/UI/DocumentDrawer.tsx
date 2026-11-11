import React from 'react';
import { GeotaggedDocument, DocumentCategory } from '../../types/index.ts';
import { formatCoordinatesDMS } from '../../utils/geo.ts';
import { 
  X, 
  Search, 
  MapPin, 
  ExternalLink, 
  FileText, 
  Calendar, 
  User, 
  Hash, 
  Compass,
  ArrowUpRight,
  Filter
} from 'lucide-react';

interface DocumentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  documents: GeotaggedDocument[];
  selectedDoc: GeotaggedDocument | null;
  onSelectDoc: (doc: GeotaggedDocument) => void;
  onOpenViewer: (doc: GeotaggedDocument) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: DocumentCategory | 'all';
  onCategoryChange: (cat: DocumentCategory | 'all') => void;
  onOpenGeotagModal: () => void;
  lang: 'he' | 'en';
}

export const DocumentDrawer: React.FC<DocumentDrawerProps> = ({
  isOpen,
  onClose,
  documents,
  selectedDoc,
  onSelectDoc,
  onOpenViewer,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  onOpenGeotagModal,
  lang,
}) => {
  const isHe = lang === 'he';

  if (!isOpen) return null;

  return (
    <aside
      className={`fixed top-16 bottom-0 z-30 w-full sm:w-96 bg-slate-900/95 border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl flex flex-col transition-all duration-300 ${
        isHe ? 'left-0 border-r' : 'right-0 border-l'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-400" />
          <h2 className="font-bold text-base text-white">
            {isHe ? 'מסמכי בלוק חיסין' : 'Chissin Block Documents'}
          </h2>
          <span className="text-xs font-semibold px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
            {documents.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          aria-label="Close drawer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/40">
        <div className="relative">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 left-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={isHe ? 'חיפוש לפי כתובת, אדריכל, היתר...' : 'Search address, architect, permit...'}
            className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Document Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {documents.length === 0 ? (
          <div className="text-center py-12 px-4">
            <MapPin className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm text-slate-400">
              {isHe ? 'לא נמצאו מסמכים תואמים' : 'No documents match filter'}
            </p>
            <button
              onClick={onOpenGeotagModal}
              className="mt-3 text-xs font-semibold text-blue-400 hover:text-blue-300"
            >
              {isHe ? '+ דקור מסמך חדש במיקום זה' : '+ Geotag a new document'}
            </button>
          </div>
        ) : (
          documents.map((doc) => {
            const isSelected = selectedDoc?.id === doc.id;
            return (
              <div
                key={doc.id}
                onClick={() => onSelectDoc(doc)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-500/10 ring-1 ring-blue-500'
                    : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-300">
                      {doc.category}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {doc.year}
                  </span>
                </div>

                <h3 className="font-bold text-sm text-slate-100 line-clamp-1 mb-1">
                  {isHe ? doc.titleHe : doc.title}
                </h3>

                <p className="text-xs text-slate-300 mb-2">
                  {isHe ? doc.addressHe : doc.address}
                </p>

                {/* Coordinates Badge */}
                <div className="flex items-center justify-between text-[11px] bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-700/50 mb-2 font-mono text-cyan-300">
                  <span className="truncate">
                    📍 {doc.coordinates.lat.toFixed(5)}°, {doc.coordinates.lng.toFixed(5)}°
                  </span>
                  <span className="text-slate-500 text-[10px]">
                    h: {doc.coordinates.elevation || 15}m
                  </span>
                </div>

                {/* Details Footer Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-700/50 text-xs">
                  <span className="text-slate-400 text-[11px] truncate max-w-[140px]">
                    {isHe ? doc.architectHe || 'אדריכל מקורי' : doc.architect || 'Historic'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDoc(doc);
                      }}
                      className="px-2 py-0.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-700/60 rounded"
                    >
                      {isHe ? 'התמקד' : 'Fly to'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenViewer(doc);
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-blue-300 hover:text-white bg-blue-600/40 hover:bg-blue-600 rounded transition-colors"
                    >
                      <span>{isHe ? 'צפה במסמך' : 'View'}</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Geotag Button in Drawer Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60">
        <button
          onClick={onOpenGeotagModal}
          className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <MapPin className="w-4 h-4" />
          <span>{isHe ? 'דקור מסמך חדש ברחוב חיסין' : 'Pin New Document on Chissin'}</span>
        </button>
      </div>
    </aside>
  );
};
