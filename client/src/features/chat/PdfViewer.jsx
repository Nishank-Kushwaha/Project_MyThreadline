import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
 * Full-screen PDF viewer: continuous scroll, like Adobe / Chrome's viewer.
 *
 * How it stays smooth
 * ───────────────────
 * 1. EVERY page gets a correctly-sized white box up front, so the scroll bar
 *    is the real length of the document and nothing ever jumps.
 * 2. Only pages within ~2 screens of the viewport are painted (and painted
 *    pages stay painted while you scroll back), so scrolling up or down never
 *    reloads a page. Far-away pages release their memory.
 * 3. Painting happens off-screen and is swapped in in one step, so a page never
 *    goes blank while it is redrawn (zoom, resize).
 * 4. A small queue draws at most 2 pages at a time, nearest page first, so
 *    scrolling stays at full frame rate.
 */

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const PAD_Y = 16; // space above the first / below the last page (px)
const GAP = 12; // space between pages (px)
const MAX_DPR = 2; // 3x phone screens would use a lot of memory for little gain
const MAX_CANVAS_PIXELS = 16_000_000; // stays under the iOS Safari canvas limit

/* ------------------------------------------------------------------ */
/* Render queue: nearest-to-the-reader page first, 2 at a time         */
/* ------------------------------------------------------------------ */
function createScheduler(getCenterPage, concurrency = 2) {
  const queue = [];
  let running = 0;

  const pump = () => {
    while (running < concurrency && queue.length) {
      const center = getCenterPage();
      queue.sort(
        (a, b) => Math.abs(a.page - center) - Math.abs(b.page - center),
      );
      const job = queue.shift();
      running += 1;
      job.run().finally(() => {
        running -= 1;
        pump();
      });
    }
  };

  return {
    enqueue(page, run) {
      const job = { page, run };
      queue.push(job);
      pump();
      return () => {
        const i = queue.indexOf(job);
        if (i >= 0) queue.splice(i, 1);
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* One page                                                            */
/* ------------------------------------------------------------------ */
const PdfPage = memo(function PdfPage({
  pdfDoc,
  pageNumber,
  width,
  height,
  scale,
  active,
  scheduler,
  registerPage,
}) {
  const canvasRef = useRef(null);
  const paintedKey = useRef(""); // what the visible canvas currently shows
  const [ready, setReady] = useState(false);

  const setWrapper = useCallback(
    (el) => registerPage(pageNumber, el),
    [registerPage, pageNumber],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Far from the screen: free the bitmap memory, keep the white box
    if (!active) {
      canvas.width = 0;
      canvas.height = 0;
      paintedKey.current = "";
      setReady(false);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const key = `${width}x${height}@${dpr}`;
    if (paintedKey.current === key) return; // already sharp at this size

    let cancelled = false;
    let task = null;
    let cancelQueued = () => {};

    // After a zoom, wait a moment so pinch/ctrl+wheel doesn't start a render per tick
    const delay = paintedKey.current ? 120 : 0;
    const timer = setTimeout(() => {
      cancelQueued = scheduler.enqueue(pageNumber, async () => {
        if (cancelled) return;
        try {
          const page = await pdfDoc.getPage(pageNumber);
          if (cancelled) return;

          // Keep the bitmap under the browser's canvas size limit
          let viewport = page.getViewport({ scale: scale * dpr });
          const shrink = Math.min(
            1,
            Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)),
          );
          if (shrink < 1) {
            viewport = page.getViewport({ scale: scale * dpr * shrink });
          }

          // Draw off-screen first...
          const offscreen = document.createElement("canvas");
          offscreen.width = Math.floor(viewport.width);
          offscreen.height = Math.floor(viewport.height);
          task = page.render({
            canvasContext: offscreen.getContext("2d"),
            viewport,
          });
          await task.promise;
          if (cancelled) return;

          // ...then swap it in within one frame: no blank flash
          const visible = canvasRef.current;
          if (!visible) return;
          visible.width = offscreen.width;
          visible.height = offscreen.height;
          visible.getContext("2d").drawImage(offscreen, 0, 0);
          paintedKey.current = key;
          setReady(true);
        } catch (err) {
          if (err?.name !== "RenderingCancelledException") {
            console.error(`PDF render error (page ${pageNumber}):`, err);
          }
        }
      });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelQueued();
      try {
        task?.cancel();
      } catch {
        /* already finished */
      }
    };
  }, [active, pdfDoc, pageNumber, scale, width, height, scheduler]);

  return (
    <div
      ref={setWrapper}
      data-page={pageNumber}
      className="relative mx-auto overflow-hidden rounded-sm bg-white shadow-2xl"
      style={{ width, height, marginBottom: GAP }}
    >
      {/* The old bitmap is stretched by CSS until the sharp one is ready */}
      <canvas ref={canvasRef} className="block h-full w-full" />
      {active && !ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-300" />
        </div>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Viewer                                                              */
/* ------------------------------------------------------------------ */
export function PdfViewer({
  blobUrl,
  fileName,
  fileSize,
  isEncrypted,
  onClose,
}) {
  const scrollRef = useRef(null);
  const pageEls = useRef([]); // wrapper elements, index = pageNumber - 1
  const scrollFrame = useRef(0);
  const centerPage = useRef(1);
  const prevCssScale = useRef(null);

  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageSizes, setPageSizes] = useState([]); // [{ w, h }] at scale 1
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [activePages, setActivePages] = useState(() => new Set());

  const numPages = pageSizes.length;

  const registerPage = useCallback((pageNumber, el) => {
    pageEls.current[pageNumber - 1] = el;
  }, []);

  const scheduler = useMemo(
    () => createScheduler(() => centerPage.current),
    [],
  );

  // ── Close on Escape ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement))
        onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Load the PDF, then measure every page so the layout is final ───────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setPageSizes([]);
    setActivePages(new Set());
    setCurrentPage(1);
    centerPage.current = 1;
    setZoom(1);
    prevCssScale.current = null;

    const loadingTask = pdfjsLib.getDocument({
      url: blobUrl,
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/cmaps/",
      cMapPacked: true,
    });

    (async () => {
      try {
        const doc = await loadingTask.promise;
        const sizes = new Array(doc.numPages);
        const CHUNK = 32;
        for (let start = 0; start < doc.numPages; start += CHUNK) {
          const count = Math.min(CHUNK, doc.numPages - start);
          const batch = await Promise.all(
            Array.from({ length: count }, async (_, k) => {
              const page = await doc.getPage(start + k + 1);
              const { width, height } = page.getViewport({ scale: 1 });
              return { w: width, h: height };
            }),
          );
          if (cancelled) return;
          batch.forEach((size, k) => {
            sizes[start + k] = size;
          });
        }
        if (cancelled) return;
        setPdfDoc(doc);
        setPageSizes(sizes);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("PDF.js load error:", err);
          setError("Failed to load PDF. Please download to view.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      loadingTask.destroy?.();
    };
  }, [blobUrl]);

  const ready = Boolean(pdfDoc) && numPages > 0;

  // ── Track the scroll area's width (window resize, sidebar, rotation) ───
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!ready || !el) return;
    setContainerWidth(el.clientWidth);

    let timer;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setContainerWidth(el.clientWidth), 100);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ready]);

  // ── Layout maths: one scale for all pages, fitted to the width ─────────
  const measured = containerWidth > 0;
  const padX = containerWidth < 640 ? 12 : 24;
  const maxPageWidth = useMemo(
    () => pageSizes.reduce((m, s) => Math.max(m, s.w), 1),
    [pageSizes],
  );
  const fitScale =
    containerWidth > 0
      ? Math.max(containerWidth - padX * 2, 160) / maxPageWidth
      : 0;
  const cssScale = fitScale * zoom;

  const layout = useMemo(() => {
    const tops = [];
    const sizes = [];
    let y = PAD_Y;
    pageSizes.forEach((s) => {
      const w = Math.round(s.w * cssScale);
      const h = Math.round(s.h * cssScale);
      sizes.push({ w, h });
      tops.push(y);
      y += h + GAP;
    });
    return { tops, sizes };
  }, [pageSizes, cssScale]);

  // ── Keep the same spot on screen when zoom / width changes ─────────────
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !cssScale) return;
    const prev = prevCssScale.current;
    prevCssScale.current = cssScale;
    if (!prev || prev === cssScale) return;
    const ratio = cssScale / prev;
    el.scrollTop =
      (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2;
    el.scrollLeft =
      (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2;
  }, [cssScale]);

  // ── Which pages are near the screen? (paint those, free the rest) ──────
  useEffect(() => {
    const root = scrollRef.current;
    if (!ready || !root || !measured) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setActivePages((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const entry of entries) {
            const page = Number(entry.target.dataset.page);
            if (entry.isIntersecting) {
              if (!next.has(page)) {
                next.add(page);
                changed = true;
              }
            } else if (next.delete(page)) {
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      },
      { root, rootMargin: "200% 0px 200% 0px" }, // ~2 screens above and below
    );

    pageEls.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [ready, measured, numPages]);

  // ── Current page number (page under the middle of the screen) ──────────
  const updateCurrentPage = useCallback(() => {
    scrollFrame.current = 0;
    const el = scrollRef.current;
    const { tops } = layout;
    if (!el || !tops.length) return;

    const y = el.scrollTop + el.clientHeight / 2;
    let lo = 0;
    let hi = tops.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tops[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    centerPage.current = lo + 1;
    setCurrentPage(lo + 1);
  }, [layout]);

  const handleScroll = useCallback(() => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(updateCurrentPage);
  }, [updateCurrentPage]);

  useEffect(() => {
    updateCurrentPage();
    return () => {
      if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = 0;
    };
  }, [updateCurrentPage]);

  // ── Ctrl + wheel / trackpad pinch = zoom (like Adobe) ──────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!ready || !el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) =>
        Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, +(z + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)),
        ),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ready]);

  // Focus the scroll area so PageUp / PageDown / Space / Home / End just work
  useEffect(() => {
    if (ready) scrollRef.current?.focus({ preventScroll: true });
  }, [ready]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const goToPage = useCallback(
    (page, smooth = true) => {
      const el = scrollRef.current;
      const top = layout.tops[page - 1];
      if (!el || top === undefined) return;
      centerPage.current = page;
      setCurrentPage(page);
      el.scrollTo({
        top: Math.max(top - PAD_Y, 0),
        behavior: smooth ? "smooth" : "auto",
      });
    },
    [layout],
  );

  // Page-number box: shows the current page; becomes an input while you type
  const [pageDraft, setPageDraft] = useState(null); // null = show currentPage

  const commitPageDraft = () => {
    const n = parseInt(pageDraft, 10);
    setPageDraft(null);
    if (Number.isNaN(n)) return;
    goToPage(Math.min(Math.max(n, 1), numPages), false); // instant, like Adobe
    scrollRef.current?.focus({ preventScroll: true }); // keys scroll the PDF again
  };

  const onPageKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitPageDraft();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setPageDraft(null);
      e.currentTarget.blur();
    }
  };

  const goToPrev = () => currentPage > 1 && goToPage(currentPage - 1);
  const goToNext = () => currentPage < numPages && goToPage(currentPage + 1);
  const zoomIn = () =>
    setZoom((z) => Math.min(+(z + 0.25).toFixed(2), MAX_ZOOM));
  const zoomOut = () =>
    setZoom((z) => Math.max(+(z - 0.25).toFixed(2), MIN_ZOOM));

  // ── Shared button style for control pill items ─────────────────────────
  const ctrlBtn =
    "flex h-9 w-9 items-center justify-center text-white/80 transition " +
    "hover:bg-white/10 active:bg-white/20 " +
    "disabled:opacity-25 disabled:cursor-not-allowed";

  // ── Render ─────────────────────────────────────────────────────────────
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white">
      {/* ══ HEADER ════════════════════════════════════════════════════════ */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-neutral-900 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5 overflow-hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10">
            <FileText className="h-4 w-4 text-white/80" />
          </div>
          <div className="min-w-0">
            <p className="max-w-35 truncate text-sm font-semibold leading-tight text-white sm:max-w-xs md:max-w-md">
              {fileName || "Document.pdf"}
            </p>
            <p className="truncate text-[11px] leading-tight text-white/50">
              {fileSize ? formatFileSize(fileSize) : ""}
              {isEncrypted ? " · 🔒 E2E encrypted" : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1.5">
          <a
            href={blobUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new tab"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

          <a
            href={blobUrl}
            download={fileName || "document.pdf"}
            title="Save as…"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <Download className="h-4 w-4" />
          </a>

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
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:bg-primary/90"
          >
            <Download className="h-4 w-4" />
            Download file
          </a>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4 sm:pb-4 lg:p-6 lg:pb-6">
          {/* Floating panel: same gap on all four sides, on every screen size */}
          <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-800 shadow-2xl">
            {/* ── Control pill ── */}
            <div className="flex shrink-0 items-center justify-center border-b border-white/10 bg-neutral-900/70 px-4 py-2.5">
              <div className="flex select-none items-center overflow-hidden rounded-full border border-white/10 bg-neutral-900/90 shadow-lg">
                <div className="flex h-9 min-w-10 items-center justify-center border-r border-white/10 px-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label={`Go to page (1 to ${numPages})`}
                    title="Type a page number and press Enter"
                    value={pageDraft ?? String(currentPage)}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      setPageDraft(
                        e.target.value.replace(/\D/g, "").slice(0, 5),
                      )
                    }
                    onKeyDown={onPageKeyDown}
                    onBlur={() => setPageDraft(null)}
                    style={{
                      width: `${Math.max(2, String(numPages).length) + 1}ch`,
                    }}
                    className="h-7 rounded-md bg-transparent text-center text-sm font-bold text-white outline-none transition-colors focus:bg-white/15"
                  />
                </div>

                <div className="flex h-9 min-w-10 items-center justify-center border-r border-white/10 px-3 text-sm font-medium text-white/40">
                  {numPages}
                </div>

                <button
                  type="button"
                  onClick={goToPrev}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                  className={`${ctrlBtn} border-r border-white/10`}
                >
                  <ChevronUp className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={goToNext}
                  disabled={currentPage >= numPages}
                  aria-label="Next page"
                  className={`${ctrlBtn} border-r border-white/10`}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={zoom >= MAX_ZOOM}
                  title={`Zoom in (${Math.round(zoom * 100)}%)`}
                  aria-label="Zoom in"
                  className={`${ctrlBtn} border-r border-white/10`}
                >
                  <ZoomIn className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={zoom <= MIN_ZOOM}
                  title={`Zoom out (${Math.round(zoom * 100)}%)`}
                  aria-label="Zoom out"
                  className={ctrlBtn}
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* ── All pages, one continuous scroll ── */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              tabIndex={0}
              aria-label="PDF pages"
              className="relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {measured && (
                <div
                  className="min-w-full"
                  style={{
                    width: "max-content",
                    padding: `${PAD_Y}px ${padX}px ${PAD_Y - GAP}px`,
                  }}
                >
                  {layout.sizes.map((size, i) => (
                    <PdfPage
                      key={i + 1}
                      pdfDoc={pdfDoc}
                      pageNumber={i + 1}
                      width={size.w}
                      height={size.h}
                      scale={cssScale}
                      active={activePages.has(i + 1)}
                      scheduler={scheduler}
                      registerPage={registerPage}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
