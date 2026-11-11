import React, { useState } from 'react';
import { ViewPreset, DocumentCategory } from '../../types/index.ts';
import { 
  ChevronDown, 
  ChevronUp, 
  Compass, 
  Layers, 
  Trees, 
  Eye, 
  Filter, 
  Camera, 
  Building2,
  FileCheck2,
  Image as ImageIcon,
  Compass as CompassIcon,
  Crosshair
} from 'lucide-react';

interface BottomDockProps {
  currentView: ViewPreset;
  onSelectView: (view: ViewPreset) => void;
  selectedCategory: DocumentCategory | 'all';
  onSelectCategory: (cat: DocumentCategory | 'all') => void;
  showTrees: boolean;
  onToggleTrees: () => void;
  isArchitecturalMode: boolean;
  onToggleArchitectural: () => void;
  isGeotagMode: boolean;
  onToggleGeotagMode: () => void;
  lang: 'he' | 'en';
}

export const BottomDock: React.FC<BottomDockProps> = ({
  currentView,
  onSelectView,
  selectedCategory,
  onSelectCategory,
  showTrees,
  onToggleTrees,
  isArchitecturalMode,
  onToggleArchitectural,
  isGeotagMode,
  onToggleGeotagMode,
  lang,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'camera' | 'filters' | 'layers'>('camera');
  const isHe = lang === 'he';

  const viewOptions: { id: ViewPreset; labelHe: string; labelEn: string; icon: string }[] = [
    { id: 'overview', labelHe: 'מבט-על (Overview)', labelEn: 'Overview', icon: '🏙️' },
    { id: 'street', labelHe: 'מפלס הרחוב (Street)', labelEn: 'Street Level', icon: '🚶' },
    { id: 'topDown', labelHe: 'מבט אורתוגונלי (Plan)', labelEn: 'Bird\'s Eye', icon: '📐' },
    { id: 'habimaView', labelHe: 'כיכר הבימה', labelEn: 'Habima Sq.', icon: '🎭' },
    { id: 'dizengoffView', labelHe: 'צומת קינג ג׳ורג׳', labelEn: 'King George', icon: '🧭' },
  ];

  const categoryOptions: { id: DocumentCategory | 'all'; labelHe: string; labelEn: string; color: string }[] = [
    { id: 'all', labelHe: 'הכל', labelEn: 'All', color: 'bg-slate-700' },
    { id: 'permit', labelHe: 'היתרי בנייה', labelEn: 'Permits', color: 'bg-amber-500' },
    { id: 'architectural', labelHe: 'תכניות אדריכליות', labelEn: 'Blueprints', color: 'bg-blue-500' },
    { id: 'preservation', labelHe: 'תיקי שימור', labelEn: 'Preservation', color: 'bg-emerald-500' },
    { id: 'facade', labelHe: 'חזיתות', labelEn: 'Facades', color: 'bg-cyan-500' },
    { id: 'cadastral', labelHe: 'תשריטי טאבו', labelEn: 'Cadastral', color: 'bg-purple-500' },
    { id: 'photo', labelHe: 'צילומים היסטוריים', labelEn: 'Photos', color: 'bg-pink-500' },
  ];

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[95vw] max-w-[880px] pointer-events-none">
      
      {/* Collapse Toggle Tab Button */}
      <div className="flex justify-center mb-1">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-1 bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold rounded-t-xl border-t border-x border-slate-700/80 shadow-md transition-all backdrop-blur-md"
          aria-label={isCollapsed ? 'Show 3D controls' : 'Hide 3D controls'}
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>{isHe ? 'הצג בקרים תלת-ממדיים' : 'Show 3D Controls'}</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>{isHe ? 'הסתר בקרים (מצב סיור)' : 'Collapse Controls'}</span>
            </>
          )}
        </button>
      </div>

      {/* Main Dock Container */}
      {!isCollapsed && (
        <div className="pointer-events-auto bg-slate-900/95 border border-slate-700/90 rounded-2xl p-3 shadow-2xl text-white backdrop-blur-xl transition-all">
          
          {/* Top row: Tab Switcher & Quick Geotag Action */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5 mb-2.5">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveTab('camera')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'camera'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{isHe ? 'זוויות מבט' : 'Camera Angles'}</span>
              </button>
              <button
                onClick={() => setActiveTab('filters')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'filters'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{isHe ? 'סינון מסמכים' : 'Document Filters'}</span>
              </button>
              <button
                onClick={() => setActiveTab('layers')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'layers'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{isHe ? 'שכבות מפה' : 'Map Layers'}</span>
              </button>
            </div>

            {/* Click-to-Pin Mode Toggle */}
            <button
              onClick={onToggleGeotagMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                isGeotagMode
                  ? 'bg-amber-500 text-slate-950 border-amber-300 ring-2 ring-amber-400/50'
                  : 'bg-slate-800 text-amber-300 border-amber-500/30 hover:bg-slate-700'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{isGeotagMode ? (isHe ? 'מצב דקירה פעיל' : 'Pinning Active') : (isHe ? 'דקור על המפה' : 'Click to Pin')}</span>
            </button>
          </div>

          {/* Tab 1: Camera Presets */}
          {activeTab === 'camera' && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {viewOptions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onSelectView(v.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all border ${
                    currentView === v.id
                      ? 'bg-slate-800 text-blue-400 border-blue-500/60 shadow-md'
                      : 'bg-slate-800/60 text-slate-300 border-slate-700/60 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>{v.icon}</span>
                  <span>{isHe ? v.labelHe : v.labelEn}</span>
                </button>
              ))}
            </div>
          )}

          {/* Tab 2: Category Filters */}
          {activeTab === 'filters' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categoryOptions.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => onSelectCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs whitespace-nowrap transition-all border ${
                    selectedCategory === cat.id
                      ? 'bg-slate-800 text-white border-blue-500 ring-1 ring-blue-500'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${cat.color}`} />
                  <span>{isHe ? cat.labelHe : cat.labelEn}</span>
                </button>
              ))}
            </div>
          )}

          {/* Tab 3: Layers & Visual Styling */}
          {activeTab === 'layers' && (
            <div className="flex items-center gap-3">
              <button
                onClick={onToggleTrees}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border transition-all ${
                  showTrees
                    ? 'bg-slate-800 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400'
                }`}
              >
                <Trees className="w-3.5 h-3.5" />
                <span>{isHe ? 'צמחיית פיקוסים עירונית' : 'Urban Foliage / Trees'}</span>
              </button>

              <button
                onClick={onToggleArchitectural}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border transition-all ${
                  isArchitecturalMode
                    ? 'bg-slate-800 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>{isHe ? 'מצב שלד אדריכלי (Wireframe)' : 'Architectural Wireframe'}</span>
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
};
