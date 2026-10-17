import React, { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronUp, ChevronDown, ZoomIn, ZoomOut, Loader2, AlertCircle, Download } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * WhatsApp Desktop-style PDF Viewer
 *
 * Layout:
 * ┌─────────────────────────────────┬───────┐
 * │                                 │  [ 1] │ ← current page number
 * │      PDF PAGE (canvas)          │ [31 ] │ ← total pages
 * │      full width of left area    │  [↑]  │
 * │      scrollable vertically      │  [↓]  │
 * │                                 │  [⊕]  │ ← zoom in
 * │                                 │  [⊖]  │ ← zoom out
 * └─────────────────────────────────┴───────┘
 *
 * Props:
 *   blobUrl   – object URL of the decrypted PDF blob
 *   fileName  – display name shown in the parent header
 */
export function PdfViewer({ blobUrl, fileName }) {
  const containerRef = useRef(null); // left scrollable area
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState(null);

  // Touch swipe for mobile
  const touchStartX = useRef(0);

  // ── Load PDF ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCurrentPage(1);
    setScale(1.0);

    const loadingTask = pdfjsLib.getDocument({
      url: blobUrl,
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/cmaps/",
      cMapPacked: true,
    });

    loadingTask.promise
      .then((doc) => {
        if (!cancelled) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("PDF.js load error:", err);
          setError("Failed to load PDF. Please download the file to view it.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      loadingTask.destroy?.();
    };
  }, [blobUrl]);

  // ── Render page ───────────────────────────────────────────────────────────
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

    // Cancel any in-flight render
    try {
      renderTaskRef.current?.cancel();
    } catch (_) { /* ignore */ }

    setRendering(true);

    try {
      const page = await pdfDoc.getPage(currentPage);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      // Fit page to the left-panel width (subtract a little padding)
      const containerWidth = Math.max(containerRef.current.clientWidth - 24, 200);
      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = (containerWidth / baseViewport.width) * scale;
      const viewport = page.getViewport({ scale: fitScale });

      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;

      const task = page.render({ canvasContext: ctx, transform, viewport });
      renderTaskRef.current = task;
      await task.promise;
    } catch (err) {
      if (err?.name !== "RenderingCancelledException") {
        console.error("PDF render error:", err);
      }
    } finally {
      setRendering(false);
    }
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => { renderPage(); }, [renderPage]);

  // Re-render on resize (debounced)
  useEffect(() => {
    let timer;
    const onResize = () => { clearTimeout(timer); timer = setTimeout(renderPage, 180); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); clearTimeout(timer); };
  }, [renderPage]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const goToPrev = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const goToNext = () => setCurrentPage((p) => Math.min(p + 1, numPages));
  const zoomIn   = () => setScale((s) => Math.min(+(s + 0.25).toFixed(2), 3.0));
  const zoomOut  = () => setScale((s) => Math.max(+(s - 0.25).toFixed(2), 0.5));

  // Touch swipe (left = next, right = prev)
  const onTouchStart = (e) => { touchStartX.current = e.changedTouches[0].screenX; };
  const onTouchEnd   = (e) => {
    const diff = touchStartX.current - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 50) diff > 0 ? goToNext() : goToPrev();
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/70">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Opening PDF…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-sm text-white/70">{error}</p>
        <a
          href={blobUrl}
          download={fileName || "document.pdf"}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition"
        >
          <Download className="h-4 w-4" />
          Download file
        </a>
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* ── Left: scrollable PDF canvas area ── */}
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative flex-1 overflow-auto bg-[#1a1a1a]"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {/* Rendering spinner overlay */}
        {rendering && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
            <Loader2 className="h-6 w-6 animate-spin text-white/80" />
          </div>
        )}

        {/* Canvas centred inside the scroll area */}
        <div className="flex min-h-full items-start justify-center p-3">
          <canvas
            ref={canvasRef}
            className="block bg-white shadow-2xl"
            style={{ maxWidth: "100%" }}
          />
        </div>
      </div>

      {/* ── Right: WhatsApp-style vertical control panel ── */}
      <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-white/10 bg-neutral-900 py-4 select-none">

        {/* Current page number */}
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white">
          {currentPage}
        </div>

        {/* Total pages */}
        <div className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium text-white/50">
          {numPages}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Up arrow (previous page) */}
        <button
          type="button"
          onClick={goToPrev}
          disabled={currentPage <= 1 || rendering}
          aria-label="Previous page"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 active:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ChevronUp className="h-5 w-5" />
        </button>

        {/* Down arrow (next page) */}
        <button
          type="button"
          onClick={goToNext}
          disabled={currentPage >= numPages || rendering}
          aria-label="Next page"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 active:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ChevronDown className="h-5 w-5" />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Zoom in */}
        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= 3.0 || rendering}
          title={`Zoom in (${Math.round(scale * 100)}%)`}
          aria-label="Zoom in"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 active:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        {/* Zoom out */}
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= 0.5 || rendering}
          title={`Zoom out (${Math.round(scale * 100)}%)`}
          aria-label="Zoom out"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 active:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

      </div>
    </div>
  );
}
