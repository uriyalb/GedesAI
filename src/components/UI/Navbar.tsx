import React from 'react';
import { User } from 'firebase/auth';
import { TARGET_FOLDER_URL } from '../../services/drive.ts';
import { MapPin, ExternalLink, LogOut, Layers, FileText, RefreshCw, Camera } from 'lucide-react';

interface NavbarProps {
  user: User | null;
  hasDriveToken: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onToggleDrawer: () => void;
  isDrawerOpen: boolean;
  docCount: number;
  onSyncDrive: () => void;
  isSyncing: boolean;
  onOpenAerialReference: () => void;
  onAddPhoto: () => void;
  lang: 'he' | 'en';
  onToggleLang: () => void;
}

const GoogleG = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export const Navbar: React.FC<NavbarProps> = ({
  user,
  hasDriveToken,
  onLogin,
  onLogout,
  onToggleDrawer,
  isDrawerOpen,
  docCount,
  onSyncDrive,
  isSyncing,
  onOpenAerialReference,
  onAddPhoto,
  lang,
  onToggleLang,
}) => {
  const isHe = lang === 'he';
  const connected = hasDriveToken && !!user;

  return (
    <header className="absolute top-0 inset-x-0 z-40 bg-slate-900/95 border-b border-slate-800 text-white shadow-xl backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm sm:text-base tracking-tight text-slate-100 truncate">
              <span className="sm:hidden">{isHe ? 'בלוק חיסין 3D' : 'Chissin 3D'}</span>
              <span className="hidden sm:inline">{isHe ? 'בלוק רחוב חיסין – מפה תלת-ממדית' : 'Chissin Street 3D Block'}</span>
            </h1>
            <p className="hidden sm:block text-xs text-slate-400 truncate">
              {isHe ? 'מסמכי ארכיון מקושרים לכל מבנה' : 'Archive documents linked to every building'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={onToggleDrawer}
            className={`flex items-center gap-1.5 h-9 px-2.5 sm:px-3 text-xs sm:text-sm font-medium rounded-xl border transition-all ${
              isDrawerOpen ? 'bg-slate-800 border-blue-500 text-blue-300' : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
            aria-label={isHe ? 'רשימת מסמכים' : 'Documents'}
          >
            <FileText className="w-4 h-4" />
            <span className="hidden md:inline">{isHe ? 'מסמכים' : 'Documents'}</span>
            <span className="px-1.5 text-[11px] font-bold bg-slate-700 text-slate-200 rounded-full">{docCount}</span>
          </button>

          <button
            onClick={onAddPhoto}
            className="flex items-center gap-1.5 h-9 px-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950"
            aria-label={isHe ? 'הוספת תמונה למפה' : 'Add a photo to the map'}
          >
            <Camera className="w-4 h-4" />
            <span className="hidden md:inline">{isHe ? 'הוספת תמונה' : 'Add photo'}</span>
          </button>

          <button
            onClick={onOpenAerialReference}
            className="flex items-center gap-1.5 h-9 px-2.5 text-xs sm:text-sm font-medium rounded-xl border border-sky-500/40 bg-sky-950/40 text-sky-300 hover:bg-sky-900/60"
            aria-label={isHe ? 'תצלומי אוויר' : 'Aerial photos'}
          >
            <Layers className="w-4 h-4" />
            <span className="hidden lg:inline">{isHe ? 'תצלומי אוויר' : 'Aerial'}</span>
          </button>

          {connected ? (
            <div className="flex items-center gap-0.5 sm:gap-1 h-9 bg-slate-800/80 border border-emerald-500/40 px-1.5 sm:px-2 rounded-xl">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-6 h-6 rounded-full" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-400 mx-1" />
              )}
              <span className="hidden lg:block text-[11px] text-slate-300 truncate max-w-[140px] mx-1">{user?.email}</span>
              <button
                onClick={onSyncDrive}
                disabled={isSyncing}
                aria-label={isHe ? 'רענן מסמכים' : 'Refresh documents'}
                className="p-1.5 text-slate-400 hover:text-slate-100"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
              </button>
              <a
                href={TARGET_FOLDER_URL}
                target="_blank"
                rel="noreferrer"
                aria-label={isHe ? 'פתח את התיקייה' : 'Open folder'}
                className="hidden sm:block p-1.5 text-slate-400 hover:text-blue-400"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button onClick={onLogout} aria-label={isHe ? 'התנתק' : 'Sign out'} className="p-1.5 text-slate-400 hover:text-rose-400">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onLogin}
              className="flex items-center gap-2 h-9 px-2.5 sm:px-3 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-medium text-xs sm:text-sm shadow-md active:scale-95"
              aria-label={isHe ? 'התחבר עם Google' : 'Sign in with Google'}
            >
              <GoogleG />
              <span className="hidden sm:inline">{isHe ? 'התחבר' : 'Sign in'}</span>
            </button>
          )}

          <button
            onClick={onToggleLang}
            className="h-9 px-2 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700"
          >
            {isHe ? 'EN' : 'עב'}
          </button>
        </div>
      </div>
    </header>
  );
};
