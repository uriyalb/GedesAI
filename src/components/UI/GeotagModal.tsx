import React, { useState, useEffect } from 'react';
import { GeotaggedDocument, DocumentCategory, BuildingPlot } from '../../types/index.ts';
import { DriveFileItem, TARGET_FOLDER_ID, inferCategoryFromFilename, extractBuildingNumber, formatBytes } from '../../services/drive.ts';
import { CHISSIN_CENTER } from '../../utils/geo.ts';
import { 
  X, 
  MapPin, 
  FolderGit2, 
  Upload, 
  FileCheck2, 
  Compass, 
  Calendar, 
  User, 
  Crosshair,
  Sparkles
} from 'lucide-react';

interface GeotagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveDocument: (doc: GeotaggedDocument) => void;
  buildings: BuildingPlot[];
  driveFiles: DriveFileItem[];
  prefilledCoords?: { lat: number; lng: number; elevation?: number } | null;
  onStartClickToPin: () => void;
  lang: 'he' | 'en';
}

export const GeotagModal: React.FC<GeotagModalProps> = ({
  isOpen,
  onClose,
  onSaveDocument,
  buildings,
  driveFiles,
  prefilledCoords,
  onStartClickToPin,
  lang,
}) => {
  const isHe = lang === 'he';

  const [selectedDriveFile, setSelectedDriveFile] = useState<DriveFileItem | null>(null);
  const [titleHe, setTitleHe] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('permit');
  const [buildingNumber, setBuildingNumber] = useState<number>(7);
  const [lat, setLat] = useState<number>(32.07385);
  const [lng, setLng] = useState<number>(34.77480);
  const [elevation, setElevation] = useState<number>(16);
  const [year, setYear] = useState<number>(1935);
  const [architectHe, setArchitectHe] = useState('אדר׳ שלמה גפשטיין');
  const [permitNumber, setPermitNumber] = useState('TLV-1935-0210');
  const [descriptionHe, setDescriptionHe] = useState('');

  // When prefilledCoords change from 3D map click, update state
  useEffect(() => {
    if (prefilledCoords) {
      setLat(prefilledCoords.lat);
      setLng(prefilledCoords.lng);
      if (prefilledCoords.elevation) setElevation(prefilledCoords.elevation);
    }
  }, [prefilledCoords]);

  // When building selection changes, auto-center coordinates to that building
  const handleBuildingChange = (num: number) => {
    setBuildingNumber(num);
    const b = buildings.find((x) => x.number === num);
    if (b) {
      setLat(b.centerCoordinates.lat);
      setLng(b.centerCoordinates.lng);
      setElevation(b.height + 2);
      setArchitectHe(b.architectHe);
      setYear(b.yearBuilt);
    }
  };

  // When user selects a file from Google Drive folder
  const handleSelectDriveFile = (file: DriveFileItem) => {
    setSelectedDriveFile(file);
    const inferredCat = inferCategoryFromFilename(file.name);
    setCategory(inferredCat);

    const bNum = extractBuildingNumber(file.name);
    if (bNum && buildings.some((b) => b.number === bNum)) {
      handleBuildingChange(bNum);
    }

    // Set clean titles
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    setTitleHe(cleanName);
    setTitleEn(cleanName);
    setDescriptionHe(`מסמך סרוק מתיקיית Google Drive: ${file.name}`);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const selectedBuilding = buildings.find((b) => b.number === buildingNumber);
    const newDoc: GeotaggedDocument = {
      id: `doc-${Date.now()}`,
      title: titleEn || titleHe || `Chissin ${buildingNumber} Document`,
      titleHe: titleHe || `מסמך רחוב חיסין ${buildingNumber}`,
      category,
      address: `${buildingNumber} Chissin St, Tel Aviv`,
      addressHe: `רחוב חיסין ${buildingNumber}, תל אביב`,
      buildingNumber,
      coordinates: {
        lat: Number(lat),
        lng: Number(lng),
        elevation: Number(elevation),
      },
      year: Number(year) || 1935,
      dateStr: `${year}-01-01`,
      architect: selectedBuilding?.architect || 'Historic Architect',
      architectHe: architectHe || selectedBuilding?.architectHe || 'אדריכל מקורי',
      description: descriptionHe || 'Historical document geotagged on Chissin Street 3D block.',
      descriptionHe: descriptionHe || 'מסמך היסטורי שנדקר על גבי מפת בלוק רחוב חיסין התלת-ממדית.',
      permitNumber: permitNumber || `TLV-${year}-01`,
      driveUrl: selectedDriveFile?.webViewLink || `https://drive.google.com/drive/u/0/folders/${TARGET_FOLDER_ID}`,
      fileId: selectedDriveFile?.id,
      fileSize: formatBytes(selectedDriveFile?.size),
      mimeType: selectedDriveFile?.mimeType || 'application/pdf',
      isDriveSynced: !!selectedDriveFile,
    };

    onSaveDocument(newDoc);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-100 max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/40 flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-white">
                {isHe ? 'דקירת מסמך חדש על המפה התלת-ממדית' : 'Geotag & Pin New Document'}
              </h2>
              <p className="text-xs text-slate-400">
                {isHe ? 'שיוך קואורדינטות מדויקות לקבצים מתיקיית ה-Drive' : 'Associate exact geographical coordinates with Drive documents'}
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

        {/* Section 1: Choose from Google Drive Files */}
        {driveFiles.length > 0 && (
          <div className="mb-5 bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
              <span className="flex items-center gap-1.5 text-blue-300">
                <FolderGit2 className="w-4 h-4 text-blue-400" />
                {isHe ? 'קבצים שנמצאו בתיקיית Google Drive' : 'Files in Google Drive folder'}
              </span>
              <span className="text-[11px] text-slate-400">{driveFiles.length} files</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1">
              {driveFiles.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => handleSelectDriveFile(file)}
                  className={`text-left p-2 rounded-lg border text-xs transition-all flex items-center justify-between gap-2 ${
                    selectedDriveFile?.id === file.id
                      ? 'bg-blue-950/60 border-blue-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{file.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">
                    {formatBytes(file.size)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4 text-xs sm:text-sm">
          
          {/* Titles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {isHe ? 'כותרת המסמך (עברית)' : 'Document Title (Hebrew)'} *
              </label>
              <input
                type="text"
                required
                value={titleHe}
                onChange={(e) => setTitleHe(e.target.value)}
                placeholder="לדוגמה: היתר בנייה ושינוי חזיתות"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {isHe ? 'כותרת המסמך (English)' : 'Document Title (English)'}
              </label>
              <input
                type="text"
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="e.g. Building Permit & Facade Plans"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Building Number & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {isHe ? 'מבנה ברחוב חיסין' : 'Building on Chissin St'} *
              </label>
              <select
                value={buildingNumber}
                onChange={(e) => handleBuildingChange(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                {buildings.map((b) => (
                  <option key={b.id} value={b.number}>
                    חיסין {b.number} ({b.style} • {b.yearBuilt})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {isHe ? 'סיווג המסמך' : 'Document Category'} *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="permit">{isHe ? 'היתר בנייה ורישיון' : 'Building Permit'}</option>
                <option value="architectural">{isHe ? 'תכנית אדריכלית' : 'Architectural Blueprint'}</option>
                <option value="preservation">{isHe ? 'תיק תיעוד ושימור' : 'Preservation File'}</option>
                <option value="facade">{isHe ? 'תכנית חזיתות' : 'Facade Plan'}</option>
                <option value="cadastral">{isHe ? 'תשריט חלוקה/טאבו' : 'Cadastral Map'}</option>
                <option value="photo">{isHe ? 'צילום היסטורי' : 'Historical Photo'}</option>
              </select>
            </div>
          </div>

          {/* Geographic Coordinates (Lat / Lng / Elev) */}
          <div className="bg-slate-950/50 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-cyan-400" />
                {isHe ? 'מיקום גאוגרפי מדויק (WGS84)' : 'Precise Coordinates (WGS84)'}
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartClickToPin();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 rounded-lg border border-amber-500/40"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>{isHe ? 'בחר נקודה ע״ג המפה התלת-ממדית' : 'Pick on 3D Map'}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Latitude (רוחב)</label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Longitude (אורך)</label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={lng}
                  onChange={(e) => setLng(parseFloat(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Elevation (גובה ב-3D)</label>
                <input
                  type="number"
                  step="0.5"
                  value={elevation}
                  onChange={(e) => setElevation(parseFloat(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300"
                />
              </div>
            </div>
          </div>

          {/* Additional details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {isHe ? 'שנת מסמך' : 'Year'}
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {isHe ? 'אדריכל מתכנן' : 'Architect'}
              </label>
              <input
                type="text"
                value={architectHe}
                onChange={(e) => setArchitectHe(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {isHe ? 'מספר היתר' : 'Permit Number'}
              </label>
              <input
                type="text"
                value={permitNumber}
                onChange={(e) => setPermitNumber(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {isHe ? 'תיאור והערות ארכיון' : 'Description / Archival Notes'}
            </label>
            <textarea
              rows={2}
              value={descriptionHe}
              onChange={(e) => setDescriptionHe(e.target.value)}
              placeholder="תיאור תכולת המסמך, פרטי שימור, היתרים מיוחדים..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 text-xs sm:text-sm"
            >
              {isHe ? 'ביטול' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2"
            >
              <MapPin className="w-4 h-4" />
              <span>{isHe ? 'שמור ודקור על המפה' : 'Save & Pin to 3D Map'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
