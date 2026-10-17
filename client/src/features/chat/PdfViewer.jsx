import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ChevronUp,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  FileText,
  Download,
  ExternalLink,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { formatFileSize } from "@/lib/e2ee/media";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Full-screen PDF Viewer — WhatsApp-inspired layout
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  ┌──────────────────────┐          ┌─────────────────────────────┐  │
 * │  │ [icon]  filename      │          │ [new-tab] [download] [close]│  │
 * │  │         size · lock  │          └─────────────────────────────┘  │
 * │  └──────────────────────┘                                           │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  (dark bg)                                                          │
 * │        ┌──────────────────────────────────────┐                     │
 * │        │  1  │  31  │  ↑  │  ↓  │  ⊕  │  ⊖  │  ← control pill    │
 * │        └──────────────────────────────────────┘                     │
 * │   ┌───────────────────────────────────────────────────────────┐     │
 * │   │                                                           │░░   │
 * │   │                  PDF  page  (canvas)                      │░░   │
 * │   │                                                           │░░   │
 * │   └───────────────────────────────────────────────────────────┘     │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export function PdfViewer({ blobUrl, fileName, fileSize, isEncrypted, onClose }) {
  const scrollRef     = useRef(null);
  const canvasRef     = useRef(null);
  const renderTaskRef = useRef(null);

  const [pdfDoc,      setPdfDoc]      = useState(null);
  const [numPages,    setNumPages]    = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale,       setScale]       = useState(1.0);
  const [loading,     setLoading]     = useState(true);
  const [rendering,   setRendering]   = useState(false);
  const [error,       setError]       = useState(null);

  const scrollingToPage    = useRef(false);
  const lastScrollTop      = useRef(0);
  const pageChangeDebounce = useRef(null);
  const touchStartX        = useRef(0);
  const touchStartY        = useRef(0);
  // Cooldown flag: prevents multiple rapid page-turns from one gesture
  const pageTurnCooldown   = useRef(false);

  // ── Close on Escape ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Load PDF ───────────────────────────────────────────────────────────
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
          setError("Failed to load PDF. Please download to view.");
          setLoading(false);
        }
      });

    return () => { cancelled = true; loadingTask.destroy?.(); };
  }, [blobUrl]);

  // ── Render page ────────────────────────────────────────────────────────
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || !scrollRef.current) return;

    try { renderTaskRef.current?.cancel(); } catch (_) { /* ignore */ }
    setRendering(true);

    try {
      const pdfPage = await pdfDoc.getPage(currentPage);
      const canvas  = canvasRef.current;
      const ctx     = canvas.getContext("2d");

      const containerWidth = scrollRef.current.clientWidth;
      const isNarrow       = containerWidth < 640;
      // Padding subtracted from available width (matches the CSS padding on the wrapper)
      const padding        = isNarrow ? 24 : 48;
      const availableWidth = Math.max(containerWidth - padding * 2, 160);

      const baseViewport = pdfPage.getViewport({ scale: 1 });
      const fitScale     = (availableWidth / baseViewport.width) * scale;
      const viewport     = pdfPage.getViewport({ scale: fitScale });

      const dpr = window.devicePixelRatio || 1;
      canvas.width        = Math.floor(viewport.width  * dpr);
      canvas.height       = Math.floor(viewport.height * dpr);
      canvas.style.width  = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;
      const task = pdfPage.render({ canvasContext: ctx, transform, viewport });
      renderTaskRef.current = task;
      await task.promise;
    } catch (err) {
      if (err?.name !== "RenderingCancelledException") console.error("PDF render error:", err);
    } finally {
      setRendering(false);
    }
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => { renderPage(); }, [renderPage]);

  useEffect(() => {
    let timer;
    const onResize = () => { clearTimeout(timer); timer = setTimeout(renderPage, 180); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); clearTimeout(timer); };
  }, [renderPage]);

  // ── Scroll → auto page-turn (desktop trackpad/wheel + mobile smooth scroll) ──
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || scrollingToPage.current || pageTurnCooldown.current) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    // Generous threshold so touch inertia or trackpad easily reaches boundary
    const atBottom  = scrollTop + clientHeight >= scrollHeight - 20;
    const atTop     = scrollTop <= 8;
    const goingDown = scrollTop > lastScrollTop.current;
    lastScrollTop.current = scrollTop;

    clearTimeout(pageChangeDebounce.current);
    pageChangeDebounce.current = setTimeout(() => {
      if (atBottom && goingDown) {
        setCurrentPage((p) => {
          if (p >= numPages) return p;
          scrollingToPage.current = true;
          pageTurnCooldown.current = true;
          requestAnimationFrame(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = 0;
            scrollingToPage.current = false;
            setTimeout(() => { pageTurnCooldown.current = false; }, 350);
          });
          return p + 1;
        });
      } else if (atTop && !goingDown) {
        setCurrentPage((p) => {
          if (p <= 1) return p;
          scrollingToPage.current = true;
          pageTurnCooldown.current = true;
          requestAnimationFrame(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            scrollingToPage.current = false;
            setTimeout(() => { pageTurnCooldown.current = false; }, 350);
          });
          return p - 1;
        });
      }
    }, 70);
  }, [numPages]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const goToPage = useCallback((next) => {
    setCurrentPage(next);
    scrollingToPage.current = true;
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      scrollingToPage.current = false;
    });
  }, []);

  const goToPrev = () => { if (currentPage > 1)       goToPage(currentPage - 1); };
  const goToNext = () => { if (currentPage < numPages) goToPage(currentPage + 1); };
  const zoomIn   = () => setScale((s) => Math.min(+(s + 0.25).toFixed(2), 3.0));
  const zoomOut  = () => setScale((s) => Math.max(+(s - 0.25).toFixed(2), 0.5));

  // ── Mobile / Tablet Touch Gestures ──────────────────────────────────────
  const onTouchStart = (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchEnd = (e) => {
    if (!e.changedTouches || e.changedTouches.length !== 1 || pageTurnCooldown.current) return;
    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    const diffY = touchStartY.current - e.changedTouches[0].clientY;

    const el = scrollRef.current;
    const isScrollable = el ? el.scrollHeight > el.clientHeight + 10 : false;

    // 1. Horizontal swipe: always triggers prev / next page
    if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (diffX > 0) goToNext(); // swipe left -> next page
      else goToPrev();          // swipe right -> previous page
      return;
    }

    // 2. Vertical swipe on mobile / tablet:
    // If content does not scroll (fits the screen) OR if user is already at top/bottom boundary
    if (Math.abs(diffY) > 50 && Math.abs(diffY) > Math.abs(diffX)) {
      if (!isScrollable) {
        // Content fits screen: swipe up -> next page, swipe down -> prev page
        if (diffY > 0) goToNext();
        else goToPrev();
      } else if (el) {
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 25;
        const atTop = el.scrollTop <= 15;

        if (diffY > 0 && atBottom) {
          // Swiped up while already at the bottom
          goToNext();
        } else if (diffY < 0 && atTop) {
          // Swiped down while already at the top
          goToPrev();
        }
      }
    }
  };

  // ── Shared button style for control pill items ─────────────────────────
  const ctrlBtn =
    "flex h-9 w-9 items-center justify-center text-white/80 transition " +
    "hover:bg-white/10 active:bg-white/20 " +
    "disabled:opacity-25 disabled:cursor-not-allowed";

  // ── Render ─────────────────────────────────────────────────────────────
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-800 text-white">

      {/* ══ HEADER ════════════════════════════════════════════════════════ */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-neutral-900 px-3 sm:px-5">

        {/* Left block — icon + file info — rounded container */}
        <div className="flex min-w-0 items-center gap-2.5 overflow-hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10">
            <FileText className="h-4 w-4 text-white/80" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white leading-tight max-w-[140px] sm:max-w-xs md:max-w-md">
              {fileName || "Document.pdf"}
            </p>
            <p className="truncate text-[11px] text-white/50 leading-tight">
              {fileSize ? formatFileSize(fileSize) : ""}
              {isEncrypted ? " · 🔒 E2E encrypted" : ""}
            </p>
          </div>
        </div>

        {/* Right block — new tab + download + close — rounded container */}
        <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1.5">
          {/* Open in new tab */}
          <a
            href={blobUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new tab"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

          {/* Download */}
          <a
            href={blobUrl}
            download={fileName || "document.pdf"}
            title="Save as…"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <Download className="h-4 w-4" />
          </a>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

      </header>

      {/* ══ CONTENT AREA ═════════════════════════════════════════════════ */}
      {loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-white/70">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Opening PDF…</p>
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
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
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* ── Control panel pill — centered below header ── */}
          <div className="flex shrink-0 items-center justify-center px-4 pt-3 pb-2">
            <div className="flex items-center overflow-hidden rounded-full border border-white/10 bg-neutral-900/90 shadow-lg select-none">

              {/* Current page */}
              <div className="flex h-9 min-w-[2.5rem] items-center justify-center border-r border-white/10 px-3 text-sm font-bold text-white">
                {currentPage}
              </div>

              {/* Total pages */}
              <div className="flex h-9 min-w-[2.5rem] items-center justify-center border-r border-white/10 px-3 text-sm font-medium text-white/40">
                {numPages}
              </div>

              {/* Prev */}
              <button
                type="button"
                onClick={goToPrev}
                disabled={currentPage <= 1 || rendering}
                aria-label="Previous page"
                className={`${ctrlBtn} border-r border-white/10`}
              >
                <ChevronUp className="h-4 w-4" />
              </button>

              {/* Next */}
              <button
                type="button"
                onClick={goToNext}
                disabled={currentPage >= numPages || rendering}
                aria-label="Next page"
                className={`${ctrlBtn} border-r border-white/10`}
              >
                <ChevronDown className="h-4 w-4" />
              </button>

              {/* Zoom in */}
              <button
                type="button"
                onClick={zoomIn}
                disabled={scale >= 3.0 || rendering}
                title={`Zoom in (${Math.round(scale * 100)}%)`}
                aria-label="Zoom in"
                className={`${ctrlBtn} border-r border-white/10`}
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
                className={ctrlBtn}
              >
                <ZoomOut className="h-4 w-4" />
              </button>

            </div>
          </div>

          {/* ── Scrollable PDF canvas with padding ── */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className="relative flex-1 overflow-auto"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {/* Rendering spinner overlay */}
            {rendering && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
                <Loader2 className="h-6 w-6 animate-spin text-white/80" />
              </div>
            )}

            {/*
              Padding:  mobile → px-6 py-4   desktop → px-12 py-8
              Canvas is centred and has a white background + shadow
            */}
            <div className="flex min-h-full items-start justify-center px-6 py-4 sm:px-12 sm:py-8">
              <canvas
                ref={canvasRef}
                className="block rounded-sm bg-white shadow-2xl"
                style={{ maxWidth: "100%", display: "block" }}
              />
            </div>
          </div>

        </div>
      )}

    </div>,
    document.body,
  );
}
