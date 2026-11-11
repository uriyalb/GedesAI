import React, { useEffect, useRef } from 'react';
import { GeotaggedDocument } from '../../types/index.ts';
import { formatCoordinatesDMS } from '../../utils/geo.ts';
import { 
  X, 
  ExternalLink, 
  Download, 
  FileText, 
  Calendar, 
  User, 
  Compass, 
  Building2, 
  Share2, 
  Check,
  FolderGit2
} from 'lucide-react';

interface DocumentViewerModalProps {
  document: GeotaggedDocument | null;
  onClose: () => void;
  lang: 'he' | 'en';
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  document: doc,
  onClose,
  lang,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = React.useState(false);
  const isHe = lang === 'he';

  // Render high-fidelity procedural blueprint / permit illustration onto canvas
  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background: Blueprint cyan-blue or aged architectural paper
    if (doc.category === 'permit') {
      // Vintage parchment municipal permit
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(0, 0, w, h);

      // Fine margin line
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, w - 40, h - 40);

      // Tel Aviv Municipality Emblem header
      ctx.fillStyle = '#78350f';
      ctx.font = 'bold 22px serif';
      ctx.textAlign = 'center';
      ctx.fillText('עיריית תל-אביב – מחלקת הנדסה ובנייה', w / 2, 60);
      ctx.font = '16px serif';
      ctx.fillText('MUNICIPALITY OF TEL-AVIV • TOWN PLANNING & BUILDING', w / 2, 85);

      ctx.beginPath();
      ctx.moveTo(40, 100);
      ctx.lineTo(w - 40, 100);
      ctx.stroke();

      // Permit details
      ctx.textAlign = 'right';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`רישיון בנייה מס׳: ${doc.permitNumber || 'TLV-1934-892'}`, w - 50, 140);
      ctx.font = '16px sans-serif';
      ctx.fillText(`רחוב: ${doc.addressHe}`, w - 50, 175);
      ctx.fillText(`גוש וחלקה: ${doc.gushHelka || 'גוש 6904 חלקה 42'}`, w - 50, 210);
      ctx.fillText(`אדריכל מתכנן: ${doc.architectHe || 'אדריכל רשום'}`, w - 50, 245);
      ctx.fillText(`שנת אישור מועצה: ${doc.year}`, w - 50, 280);

      // Technical floor schematic sketch
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(50, 320, w - 100, 200);

      // Room partitions
      ctx.beginPath();
      ctx.moveTo(w / 2, 320);
      ctx.lineTo(w / 2, 520);
      ctx.moveTo(50, 420);
      ctx.lineTo(w - 50, 420);
      ctx.stroke();

      // Curved balcony projection
      ctx.beginPath();
      ctx.arc(w / 2, 520, 40, 0, Math.PI);
      ctx.stroke();

      // Red Municipal Stamp
      ctx.save();
      ctx.translate(140, 460);
      ctx.rotate(-0.25);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 80, 45, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('אושר לבנייה', 0, -8);
      ctx.font = '12px sans-serif';
      ctx.fillText(`תל אביב ${doc.year}`, 0, 14);
      ctx.restore();

    } else if (doc.category === 'architectural' || doc.category === 'facade') {
      // Classic Blueprint (Cyan-blue with white CAD grid lines)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Border title box
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(15, 15, w - 30, h - 30);

      // Bauhaus Elevation drawing
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;

      // Building outline
      const bx = 100;
      const by = 160;
      const bw = w - 200;
      const bh = 320;
      ctx.strokeRect(bx, by, bw, bh);

      // Ribbon windows
      ctx.fillStyle = '#38bdf8';
      for (let i = 0; i < 4; i++) {
        const floorY = by + i * 75 + 15;
        ctx.strokeRect(bx + 30, floorY, bw - 60, 24);

        // Curved Balcony
        ctx.beginPath();
        ctx.arc(bx + bw - 40, floorY + 12, 35, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }

      // Title Block
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`PROJECT: ${doc.address.toUpperCase()}`, 30, 45);
      ctx.font = '14px monospace';
      ctx.fillText(`ARCHITECT: ${doc.architect || 'Rubin & Gepstein'} | SCALE 1:50 | ${doc.year}`, 30, 75);

    } else {
      // Archive Document / Photo / Preservation
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(doc.titleHe, w / 2, 80);

      ctx.strokeStyle = '#475569';
      ctx.strokeRect(40, 120, w - 80, 360);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '15px sans-serif';
      ctx.fillText('תיעוד היסטורי מאושר מארכיון עיריית תל-אביב', w / 2, 280);
      ctx.fillText(`רחוב חיסין מס׳ ${doc.buildingNumber} • שנת ${doc.year}`, w / 2, 320);
    }
  }, [doc]);

  if (!doc) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(
      `https://maps.google.com/?q=${doc.coordinates.lat},${doc.coordinates.lng}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
        
        {/* Left / Top: High-Res Blueprint / Document Canvas Preview */}
        <div className="w-full md:w-1/2 bg-slate-950 p-4 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-800">
          <div className="relative w-full rounded-xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-950">
            <canvas
              ref={canvasRef}
              width={640}
              height={560}
              className="w-full h-auto block object-contain"
            />
          </div>
          <div className="mt-3 flex items-center justify-between w-full text-xs text-slate-400 px-1">
            <span className="font-mono">{doc.fileSize || '8.4 MB'} • {doc.mimeType || 'PDF/CAD'}</span>
            <span className="text-cyan-400 font-semibold">{doc.category.toUpperCase()}</span>
          </div>
        </div>

        {/* Right / Bottom: Detailed Metadata & Geotag Details */}
        <div className="w-full md:w-1/2 p-6 flex flex-col justify-between overflow-y-auto">
          <div>
            {/* Top Close Button & Category */}
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {doc.category}
              </span>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document Titles */}
            <h2 className="text-xl font-bold text-white mb-1 leading-snug">
              {doc.titleHe}
            </h2>
            <h3 className="text-sm text-slate-400 mb-4">
              {doc.title}
            </h3>

            {/* Geographical Coordinates Card */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 mb-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
                <span className="flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-cyan-400" />
                  {isHe ? 'קואורדינטות גאוגרפיות מדויקות' : 'Precise Coordinates'}
                </span>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{copied ? (isHe ? 'הועתק!' : 'Copied!') : (isHe ? 'העתק קישור' : 'Copy')}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-700/60">
                  <div className="text-slate-400 text-[10px]">LATITUDE (קו רוחב)</div>
                  <div className="text-cyan-300 font-bold">{doc.coordinates.lat.toFixed(6)}° N</div>
                </div>
                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-700/60">
                  <div className="text-slate-400 text-[10px]">LONGITUDE (קו אורך)</div>
                  <div className="text-cyan-300 font-bold">{doc.coordinates.lng.toFixed(6)}° E</div>
                </div>
              </div>

              <div className="mt-2 text-[11px] text-slate-400 font-mono">
                DMS: {formatCoordinatesDMS(doc.coordinates.lat, doc.coordinates.lng)}
              </div>
            </div>

            {/* Metadata Attributes Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <div className="text-slate-400">{isHe ? 'כתובת' : 'Address'}</div>
                  <div className="font-semibold text-slate-200">{doc.addressHe}</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <div className="text-slate-400">{isHe ? 'שנת תיעוד' : 'Year / Date'}</div>
                  <div className="font-semibold text-slate-200">{doc.year} ({doc.dateStr})</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <User className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <div className="text-slate-400">{isHe ? 'אדריכל מקורי' : 'Architect'}</div>
                  <div className="font-semibold text-slate-200">{doc.architectHe || doc.architect || 'Unknown'}</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <div className="text-slate-400">{isHe ? 'מס׳ היתר / רישום' : 'Permit ID'}</div>
                  <div className="font-semibold text-slate-200">{doc.permitNumber || 'TLV-1934'}</div>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-slate-800">
              {isHe ? doc.descriptionHe : doc.description}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
            {doc.driveUrl ? (
              <a
                href={doc.driveUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all"
              >
                <FolderGit2 className="w-4 h-4" />
                <span>{isHe ? 'פתח ב-Google Drive' : 'Open in Google Drive'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : null}

            <a
              href={`https://maps.google.com/?q=${doc.coordinates.lat},${doc.coordinates.lng}`}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-xs sm:text-sm flex items-center justify-center gap-2 border border-slate-700 transition-all"
            >
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>{isHe ? 'מפה עירונית' : 'Google Maps'}</span>
            </a>
          </div>
        </div>

      </div>
    </div>
  );
};
