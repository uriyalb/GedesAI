import React from 'react';
import { BuildingPlot, GeotaggedDocument } from '../../types/index.ts';
import { Building2, Calendar, User, Compass, Pin, FileText, X, ExternalLink, Award } from 'lucide-react';

interface BuildingInfoCardProps {
  building: BuildingPlot;
  associatedDocs: GeotaggedDocument[];
  onClose: () => void;
  onGeotagOnBuilding: (building: BuildingPlot) => void;
  onSelectDoc: (doc: GeotaggedDocument) => void;
  lang: 'he' | 'en';
}

export const BuildingInfoCard: React.FC<BuildingInfoCardProps> = ({
  building,
  associatedDocs,
  onClose,
  onGeotagOnBuilding,
  onSelectDoc,
  lang,
}) => {
  const isHe = lang === 'he';

  const buildingTitle = building.number > 0
    ? (isHe ? `${building.streetHe} ${building.number}` : `${building.street} ${building.number}`)
    : (isHe ? (building.streetHe || 'מבנה ברחוב חיסין') : (building.street || 'Chissin Block Building'));

  return (
    <div
      className={`fixed top-20 ${
        isHe ? 'left-6' : 'right-6'
      } z-30 w-96 max-w-[calc(100vw-3rem)] bg-slate-900/95 backdrop-blur-xl border border-sky-500/30 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-top-4`}
    >
      {/* Header */}
      <div className="relative bg-gradient-to-r from-sky-950 via-slate-900 to-indigo-950 p-4 border-b border-slate-800">
        <button
          onClick={onClose}
          className="absolute top-3.5 left-3.5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/80 transition-colors"
          title={isHe ? 'סגור' : 'Close'}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 pr-2">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white leading-tight">
              {buildingTitle}
            </h3>
            <div className="text-xs text-slate-400 mt-0.5">
              {building.style || (isHe ? 'סגנון בינלאומי (באוהאוס)' : 'International Style')}
            </div>
          </div>
        </div>

        {building.preservationStatus && building.preservationStatus !== 'Documented' && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <Award className="w-3.5 h-3.5" />
            <span>
              {isHe
                ? building.preservationStatus === 'Strict'
                  ? 'מבנה לשימור מחמיר'
                  : 'מבנה במרקם השימור העירוני'
                : `Preservation: ${building.preservationStatus}`}
            </span>
          </div>
        )}
      </div>

      {/* Building Details */}
      <div className="p-4 space-y-3.5 max-h-[60vh] overflow-y-auto text-sm">
        {/* Core Specs: Year & Levels */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
              <span>{isHe ? 'שנת הקמה' : 'Year Built'}</span>
            </div>
            <div className="font-semibold text-slate-200">{building.yearBuilt || '1936'}</div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Compass className="w-3.5 h-3.5 text-sky-400" />
              <span>{isHe ? 'קומות וגובה' : 'Levels / Height'}</span>
            </div>
            <div className="font-semibold text-slate-200">
              {building.levels} {isHe ? 'קומות' : 'floors'} ({Math.round(building.height)}m)
            </div>
          </div>
        </div>

        {/* Architect */}
        {building.architectHe && (
          <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <User className="w-3.5 h-3.5 text-sky-400" />
              <span>{isHe ? 'אדריכל מתכנן' : 'Architect'}</span>
            </div>
            <div className="font-semibold text-slate-200">
              {isHe ? building.architectHe : building.architect}
            </div>
          </div>
        )}

        {/* Description - only if meaningful architectural notes exist */}
        {building.descriptionHe && !building.descriptionHe.includes('מעטפת מבנה אותנטית מתוך מאגר OSM') && (
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-xs text-slate-300 leading-relaxed">
            {isHe ? building.descriptionHe : building.style}
          </div>
        )}

        {/* Associated Geotagged Documents */}
        <div className="pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              {isHe ? 'מסמכים מקושרים' : 'Tagged Documents'} ({associatedDocs.length})
            </span>
          </div>

          {associatedDocs.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-1">
              {isHe
                ? 'אין עדיין מסמכים מקושרים למבנה זה.'
                : 'No documents tagged yet on this building.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {associatedDocs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onSelectDoc(doc)}
                  className="w-full text-right p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 flex items-center justify-between text-xs transition-colors group"
                >
                  <div className="truncate pl-2">
                    <span className="font-medium text-slate-200 group-hover:text-sky-300">
                      {isHe ? doc.titleHe : doc.title}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {doc.year} • {isHe ? doc.addressHe : doc.address}
                    </span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action: Geotag Document on This Building */}
        <button
          onClick={() => onGeotagOnBuilding(building)}
          className="w-full mt-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-900/30 transition-all hover:scale-[1.01]"
        >
          <Pin className="w-3.5 h-3.5" />
          <span>{isHe ? 'דקור מסמך חדש על מבנה זה' : 'Geotag Document on This Building'}</span>
        </button>
      </div>
    </div>
  );
};
