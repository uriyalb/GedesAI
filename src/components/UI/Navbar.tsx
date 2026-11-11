import React from 'react';
import { User } from 'firebase/auth';
import { TARGET_FOLDER_ID } from '../../services/drive.ts';
import { 
  MapPin, 
  PlusCircle, 
  FolderGit2, 
  ExternalLink, 
  LogOut, 
  Layers, 
  FileText,
  Compass,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

interface NavbarProps {
  user: User | null;
  hasDriveToken: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onOpenGeotagModal: () => void;
  onToggleDrawer: () => void;
  isDrawerOpen: boolean;
  docCount: number;
  onSyncDrive: () => void;
  isSyncing: boolean;
  onOpenAerialReference: () => void;
  lang: 'he' | 'en';
  onToggleLang: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  hasDriveToken,
  onLogin,
  onLogout,
  onOpenGeotagModal,
  onToggleDrawer,
  isDrawerOpen,
  docCount,
  onSyncDrive,
  isSyncing,
  onOpenAerialReference,
  lang,
  onToggleLang,
}) => {
  const isHe = lang === 'he';

  return (
    <header className="absolute top-0 left-0 right-0 z-20 bg-slate-900/90 border-b border-slate-800 text-white shadow-xl backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        
        {/* Brand Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-tight text-slate-100">
                {isHe ? 'בלוק רחוב חיסין – מפה תלת-ממדית' : 'Chissin (Hassin) Street 3D Block'}
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 text-[11px] font-semibold bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                Tel Aviv White City
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {isHe ? 'תיעוד היסטורי, היתרי בנייה וגיאו-טאגינג למסמכי Drive' : 'Architectural archives & Google Drive geotagging'}
            </p>
          </div>
        </div>

        {/* Center / Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Geotag Document Button */}
          <button
            onClick={onOpenGeotagModal}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition-all"
            title="Geotag document on map"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{isHe ? 'דקור מסמך חדש' : 'Geotag Document'}</span>
          </button>

          {/* Aerial Reference Button */}
          <button
            onClick={onOpenAerialReference}
            className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-xl border border-sky-500/40 bg-sky-950/40 text-sky-300 hover:bg-sky-900/60 transition-all"
            title="View Real Aerial Photogrammetry (Simplex 3D)"
          >
            <Layers className="w-4 h-4 text-sky-400" />
            <span className="hidden sm:inline">{isHe ? 'תצלומי שטח (3D)' : 'Aerial Mesh'}</span>
          </button>

          {/* Document Drawer Toggle */}
          <button
            onClick={onToggleDrawer}
            className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-xl border transition-all ${
              isDrawerOpen
                ? 'bg-slate-800 border-blue-500 text-blue-400'
                : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span className="hidden md:inline">{isHe ? 'רשימת מסמכים' : 'Documents'}</span>
            <span className="px-1.5 py-0.5 text-[11px] font-bold bg-slate-700 text-slate-200 rounded-full">
              {docCount}
            </span>
          </button>

          {/* Google Drive Status & Sign In */}
          {hasDriveToken && user ? (
            <div className="flex items-center gap-2 bg-slate-800/80 border border-emerald-500/40 px-2.5 py-1.5 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <div className="hidden lg:flex flex-col text-left">
                <span className="text-[11px] font-medium text-emerald-300">
                  {isHe ? 'מחובר ל-Drive' : 'Drive Connected'}
                </span>
                <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  {user.email}
                </span>
              </div>
              <button
                onClick={onSyncDrive}
                disabled={isSyncing}
                title="Sync files from Google Drive"
                className="p-1 text-slate-400 hover:text-slate-100 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
              </button>
              <a
                href={`https://drive.google.com/drive/u/0/folders/${TARGET_FOLDER_ID}`}
                target="_blank"
                rel="noreferrer"
                title="Open Folder in Google Drive"
                className="p-1 text-slate-400 hover:text-blue-400 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={onLogout}
                title="Sign Out"
                className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onLogin}
              className="flex items-center gap-2.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-medium text-xs sm:text-sm shadow-md transition-all active:scale-95"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span className="hidden sm:inline">Google Drive</span>
              <span>{isHe ? 'התחבר' : 'Sign in'}</span>
            </button>
          )}

          {/* Language Toggle */}
          <button
            onClick={onToggleLang}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700"
          >
            {isHe ? 'EN' : 'עב'}
          </button>
        </div>
      </div>
    </header>
  );
};
