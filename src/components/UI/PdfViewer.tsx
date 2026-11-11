import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Loader2 } from 'lucide-react';

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

/** Loads pdf.js lazily so the main bundle stays small. */
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

interface PdfViewerProps {
  data: Blob;
  /** 1 = fit to width */
  zoom: number;
  onError: (err: Error) => void;
  onPageCount?: (n: number) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ data, zoom, onError, onPageCount }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [aspect, setAspect] = useState(1.414);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const bytes = new Uint8Array(await data.arrayBuffer());
        const assets = `${import.meta.env.BASE_URL}pdfjs/`;
        doc = await pdfjs.getDocument({
          data: bytes,
          cMapUrl: `${assets}cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${assets}standard_fonts/`,
          // Draw glyph outlines directly instead of loading them as web fonts: subset
          // TrueType fonts with Hebrew glyphs otherwise lose characters in some browsers.
          disableFontFace: true,
        }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        const first = await doc.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        setAspect(vp.height / vp.width);
        setPdf(doc);
        onPageCount?.(doc.numPages);
      } catch (e: any) {
        if (!cancelled) onError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [data]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const pageWidth = Math.max(0, (width - 16) * zoom);

  return (
    <div ref={containerRef} className="w-full">
      {!pdf ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-2" style={{ minWidth: pageWidth + 16 }}>
          {Array.from({ length: pdf.numPages }, (_, i) => (
            <PdfPage key={i} pdf={pdf} pageNumber={i + 1} width={pageWidth} aspect={aspect} />
          ))}
        </div>
      )}
    </div>
  );
};

const PdfPage: React.FC<{ pdf: PDFDocumentProxy; pageNumber: number; width: number; aspect: number }> = ({
  pdf,
  pageNumber,
  width,
  aspect,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [pageAspect, setPageAspect] = useState(aspect);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), {
      rootMargin: '800px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || width <= 0) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setPageAspect(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Cap the canvas size so very large scans don't exhaust mobile memory.
      const scale = Math.min((width * dpr) / base.width, 4096 / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      task = page.render({ canvasContext: ctx, viewport: vp });
      try {
        await task.promise;
        if (!cancelled) setRendered(true);
      } catch {
        /* cancelled */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, width, pdf, pageNumber]);

  return (
    <div
      ref={wrapRef}
      className="relative bg-white shadow-lg rounded-sm shrink-0"
      style={{ width, height: width * pageAspect }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}
      <span className="absolute bottom-1 left-1 text-[10px] bg-slate-900/60 text-white px-1.5 rounded">
        {pageNumber}/{pdf.numPages}
      </span>
    </div>
  );
};
