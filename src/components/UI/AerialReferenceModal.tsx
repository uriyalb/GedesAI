import React, { useState } from 'react';
import { X, Layers, ExternalLink, Compass, Eye, ChevronRight, ChevronLeft } from 'lucide-react';

interface AerialReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'he' | 'en';
}

const AERIAL_PHOTOS = [
  {
    id: 'aerial-1',
    src: '/public/assets/aistudio/image_a2f14507.png',
    titleHe: 'מבט מפורט על רחוב חיסין וגינת חיסין',
    titleEn: 'Close-up: Chissin Street & Gan Chissin',
    coords: 'E: 179037.59, N: 664708.18, Height: 27.14 m',
    descriptionHe: 'מבט אווירי ישיר על מעטפות המבנים של רחוב חיסין, הגגות עם דודי השמש וקומפלקס הצמרות של גינת חיסין.',
  },
  {
    id: 'aerial-2',
    src: '/public/assets/aistudio/image_5d1bb75d.png',
    titleHe: 'שדרות בן ציון ומפגש רחוב חיסין (דרום)',
    titleEn: 'Ben Zion Blvd & Chissin South Junction',
    coords: 'E: 178941.14, N: 664391.40, Height: 32.77 m',
    descriptionHe: 'מבט המציג את מעטפת המבנים לאורך שדרות בן ציון, שדרת הפיקוסים המרכזית ופתח רחוב חיסין הדרומי.',
  },
  {
    id: 'aerial-3',
    src: '/public/assets/aistudio/image_63580cdb.png',
    titleHe: 'כיכר הבימה, היכל התרבות ובלוק חיסין ממזרח',
    titleEn: 'Habima Square & Chissin Block from East',
    coords: 'E: 179755.96, N: 665007.19, Height: 25.66 m',
    descriptionHe: 'מבט מזרחי רחב המציג את תיאטרון הבימה, היכל התרבות, הגן השקוע ורצף המבנים של חיסין ברקע.',
  },
  {
    id: 'aerial-4',
    src: '/public/assets/aistudio/image_59264e13.png',
    titleHe: 'מבט מערבי לעבר כיכר הבימה ומגדל דיזנגוף',
    titleEn: 'Looking toward Habima & Dizengoff Tower',
    coords: 'E: 179288.00, N: 664111.09, Height: 34.50 m',
    descriptionHe: 'מבט פנורמי המשלב את מגדל דיזנגוף סנטר (משמאל) ואת בלוק חיסין המרכזי המוביל לכיכר הבימה.',
  },
  {
    id: 'aerial-5',
    src: '/public/assets/aistudio/image_99b5fde7.png',
    titleHe: 'מבט אווירי אורתוגונלי על בלוק חיסין',
    titleEn: 'Orthogonal Aerial Overview of Chissin Block',
    coords: 'E: 179467.15, N: 664741.85, Height: 25.75 m',
    descriptionHe: 'צילום פוטוגרמטרי המציג את צפיפות המבנים, חצרות פנימיות וגגות הטיח הלבנים של העיר הלבנה.',
  },
];

export const AerialReferenceModal: React.FC<AerialReferenceModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const isHe = lang === 'he';

  if (!isOpen) return null;

  const current = AERIAL_PHOTOS[selectedIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base text-white">
                {isHe ? 'צילומי שטח ופוטוגרמטריה אווירית – Simplex 3D' : 'Real Aerial Photogrammetry Reference – Simplex 3D'}
              </h2>
              <p className="text-xs text-slate-400">
                {isHe ? 'מעטפות שטח ומבנים מהימנות מהעולם האמיתי (הטכניון / סימפלקס תלת-ממד)' : 'Real-world photogrammetric mesh envelopes (Technion / Simplex 3D)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Image Viewer */}
        <div className="flex-1 overflow-hidden relative bg-black flex items-center justify-center">
          <img
            src={current.src}
            alt={current.titleEn}
            className="w-full h-full object-contain max-h-[60vh] select-none"
          />

          {/* Navigation Arrows */}
          <button
            onClick={() => setSelectedIndex((prev) => (prev > 0 ? prev - 1 : AERIAL_PHOTOS.length - 1))}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white border border-slate-700 shadow-xl"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setSelectedIndex((prev) => (prev < AERIAL_PHOTOS.length - 1 ? prev + 1 : 0))}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white border border-slate-700 shadow-xl"
            aria-label="Next image"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* ITM Coordinates Watermark Pill */}
          <div className="absolute bottom-3 left-3 bg-slate-950/80 text-cyan-300 font-mono text-[11px] px-3 py-1 rounded-lg border border-slate-800 backdrop-blur-sm">
            📍 {current.coords}
          </div>
        </div>

        {/* Thumbnail Selector & Caption */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="max-w-md">
            <h3 className="font-bold text-sm text-white">
              {isHe ? current.titleHe : current.titleEn}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isHe ? current.descriptionHe : current.coords}
            </p>
          </div>

          {/* Thumbnails row */}
          <div className="flex items-center gap-2 overflow-x-auto">
            {AERIAL_PHOTOS.map((photo, idx) => (
              <button
                key={photo.id}
                onClick={() => setSelectedIndex(idx)}
                className={`relative w-16 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                  selectedIndex === idx
                    ? 'border-sky-400 ring-2 ring-sky-400/40 scale-105'
                    : 'border-slate-700 opacity-60 hover:opacity-100'
                }`}
              >
                <img src={photo.src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
