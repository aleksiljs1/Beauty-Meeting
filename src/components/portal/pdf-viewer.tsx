"use client";

import { Loader2, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { portalText } from "@/i18n/portal";
import { cn } from "@/lib/utils";

const t = portalText.materials.pdf;

/** 1 = the page fits the viewer's width. */
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
/** iOS Safari draws nothing on canvases bigger than this; zoomed pages get fewer pixels instead. */
const MAX_CANVAS_PIXELS = 16_000_000;
/** Padding around the pages, in CSS px (p-3). */
const PAD = 12;

type Size = { width: number; height: number };

let pdfjs: Promise<typeof import("pdfjs-dist")> | null = null;

/** pdf.js is loaded only when a protected PDF is opened, with one worker for the whole visit. */
function loadPdfJs() {
  pdfjs ??= import("pdfjs-dist")
    .then((lib) => {
      lib.GlobalWorkerOptions.workerPort ??= new Worker(new URL("./pdf-worker.ts", import.meta.url), { type: "module" });
      return lib;
    })
    .catch((error: unknown) => {
      pdfjs = null; // a failed load (e.g. a dropped connection) can be retried by reopening
      throw error;
    });
  return pdfjs;
}

/**
 * A PDF shown inside the page, for materials whose downloads are switched off. Every page is drawn on a
 * canvas: there is no browser PDF viewer (with its save button) and no raw file tab that a phone would save.
 * A deterrent, not DRM: the server still refuses downloads, and the file link expires within minutes.
 */
export function PdfViewer({ url, name }: { url: string; name: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const [current, setCurrent] = useState(1);
  const [width, setWidth] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  /** Where the reader is (as fractions of the content), kept across zoom changes. */
  const anchor = useRef({ top: 0, left: 0.5 });

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        // The whole file is fetched right away: the link expires after a few minutes.
        const [lib, bytes] = await Promise.all([
          loadPdfJs(),
          fetch(url, { credentials: "omit" }).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.arrayBuffer();
          }),
        ]);
        if (cancelled) return;
        task = lib.getDocument({ data: new Uint8Array(bytes) });
        const opened = await task.promise;
        if (cancelled) return;
        const pageSizes = await Promise.all(
          Array.from({ length: opened.numPages }, (_, i) =>
            opened.getPage(i + 1).then((page) => {
              const { width, height } = page.getViewport({ scale: 1 });
              return { width, height };
            }),
          ),
        );
        if (cancelled) return;
        setSizes(pageSizes);
        setDoc(opened);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy(); // frees the document in the worker
    };
  }, [url]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Full screen: Escape leaves it, and the page behind doesn't scroll.
  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFull(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  const widest = sizes.reduce((max, size) => Math.max(max, size.width), 0);
  const scale = widest && width ? ((width - 2 * PAD) / widest) * zoom : 0;

  // Zooming keeps the same spot of the document on screen.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !scale) return;
    el.scrollTop = anchor.current.top * el.scrollHeight;
    el.scrollLeft = anchor.current.left * el.scrollWidth - el.clientWidth / 2;
  }, [scale]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el || !el.scrollHeight) return;
    anchor.current = { top: el.scrollTop / el.scrollHeight, left: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth };
    // The current page: the last one whose top is above the upper third of the viewer.
    const line = el.scrollTop + el.clientHeight / 3;
    let page = 1;
    for (const child of Array.from(pages.current?.children ?? [])) {
      if ((child as HTMLElement).offsetTop <= line) page = Number((child as HTMLElement).dataset.page);
      else break;
    }
    setCurrent(page);
  };

  const zoomIndex = ZOOMS.indexOf(zoom);
  const step = (direction: 1 | -1) => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, zoomIndex + direction))]!);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-card select-none [-webkit-touch-callout:none]",
        full ? "fixed inset-0 z-50" : "rounded-md border",
      )}
      // No "save image" on a long press or a right click.
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <p className="min-w-0 truncate pl-1 text-xs text-muted-foreground tabular-nums">
          {full ? <span className="font-medium text-foreground">{name} · </span> : null}
          {doc ? t.page(current, doc.numPages) : null}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label={t.zoomOut} disabled={!doc || zoomIndex <= 0} onClick={() => step(-1)}>
            <Minus />
          </Button>
          <Button variant="ghost" size="sm" className="w-14 tabular-nums" aria-label={t.fit} title={t.fit} disabled={!doc} onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t.zoomIn} disabled={!doc || zoomIndex >= ZOOMS.length - 1} onClick={() => step(1)}>
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={full ? t.exitFullscreen : t.fullscreen} onClick={() => setFull((value) => !value)}>
            {full ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </div>
      </div>

      <div
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label={t.document(name)}
        onScroll={onScroll}
        className={cn("overflow-auto overscroll-contain bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50", full ? "flex-1" : "h-[70vh] min-h-96")}
      >
        {failed ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t.error}</p>
        ) : !doc || !scale ? (
          <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t.loading}
          </p>
        ) : (
          <div ref={pages} className="relative mx-auto flex w-max min-w-full flex-col items-center gap-3 p-3">
            {sizes.map((size, i) => (
              <PdfPage key={i} doc={doc} number={i + 1} size={size} scale={scale} root={scroller} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One page: drawn only while it is on screen or close to it, and freed again when far away. */
function PdfPage({ doc, number, size, scale, root }: { doc: PDFDocumentProxy; number: number; size: Size; scale: number; root: RefObject<HTMLDivElement | null> }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setNear(!!entry?.isIntersecting), { root: root.current, rootMargin: "800px 400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    if (!near) {
      target.width = 0; // far away: give the memory back (long documents on phones)
      target.height = 0;
      return;
    }
    let stopped = false;
    let task: RenderTask | null = null;
    void doc
      .getPage(number)
      .then((page) => {
        if (stopped) return;
        const css = page.getViewport({ scale });
        let ratio = Math.min(window.devicePixelRatio || 1, 2);
        if (css.width * css.height * ratio * ratio > MAX_CANVAS_PIXELS) ratio = Math.sqrt(MAX_CANVAS_PIXELS / (css.width * css.height));
        const viewport = page.getViewport({ scale: scale * ratio });
        // Drawn off screen first, so a zoom doesn't blank the page while it redraws.
        const off = document.createElement("canvas");
        off.width = Math.floor(viewport.width);
        off.height = Math.floor(viewport.height);
        task = page.render({ canvas: off, viewport });
        return task.promise.then(() => {
          if (stopped) return;
          target.width = off.width;
          target.height = off.height;
          target.getContext("2d")?.drawImage(off, 0, 0);
          off.width = 0;
          off.height = 0;
        });
      })
      .catch(() => undefined); // cancelled by a zoom, scrolling away or closing
    return () => {
      stopped = true;
      task?.cancel();
    };
  }, [near, doc, number, scale]);

  return (
    <div ref={box} data-page={number} className="relative shrink-0 bg-white shadow-sm" style={{ width: size.width * scale, height: size.height * scale }}>
      <canvas ref={canvas} className="absolute inset-0 size-full" />
    </div>
  );
}
