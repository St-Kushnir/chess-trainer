"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DebutSideId, DebutVideoItem } from "@/lib/learn/debutVideos";
import { debutVideoPublicUrl } from "@/lib/learn/debutVideos";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/** Кадр прев’ю: 15% загальної довжини від початку (не далі ніж майже кінець файлу). */
function previewTimeFromDuration(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0.1;
  const atFifteenPercent = duration * 0.15;
  const nearEnd = Math.max(duration - 0.05, 0.05);
  return Math.min(Math.max(atFifteenPercent, 0.001), nearEnd);
}

/** Tailwind `md`: планшет і десктоп — відео в модалці. */
const MD_UP_QUERY = "(min-width: 768px)";

/** Додатковий зум лише для прямокутних джерел (прибрати типові чорні смуги в кадрі). Квадратні — 1. */
function previewScaleForIntrinsicDimensions(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  const ar = width / height;
  // Майже квадрат — ок, лише object-cover у квадратну рамку
  if (Math.abs(ar - 1) < 0.085) return 1;
  // Широкий формат (екранні записи з полями з боків)
  if (ar >= 1.5) return 1.19;
  if (ar >= 1.25) return 1.11;
  if (ar >= 1.1) return 1.085;
  return 1.06;
}

type Props = {
  side: DebutSideId;
  item: DebutVideoItem;
  /** Позиція в списку сторінки — для навігації в модалці (планшет/десктоп). */
  videoIndex: number;
  allVideos: DebutVideoItem[];
};

export function DebutVideoCard({ side, item, videoIndex, allVideos }: Props) {
  const videoId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const modalVideoRef = useRef<HTMLVideoElement>(null);
  const inlineOpenRef = useRef(false);
  const isMdUp = useMediaQuery(MD_UP_QUERY);

  /** Мобільний: відтворення на самій картці + контроли. */
  const [inlineOpen, setInlineOpen] = useState(false);
  /** Планшет/десктоп: модальне вікно. */
  const [modalOpen, setModalOpen] = useState(false);
  /** Який ролик показано в модалці (можна листати попередній/наступний). */
  const [modalVideoIdx, setModalVideoIdx] = useState(videoIndex);
  const [mounted, setMounted] = useState(false);

  /** Зум прев’ю тільки для не-квадратних відео; після loadedmetadata. */
  const [previewScale, setPreviewScale] = useState(1);

  const viewing = inlineOpen || modalOpen;

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    inlineOpenRef.current = inlineOpen;
  }, [inlineOpen]);

  useEffect(() => {
    if (!isMdUp && modalOpen) {
      queueMicrotask(() => {
        setModalOpen(false);
      });
    }
  }, [isMdUp, modalOpen]);

  useEffect(() => {
    if (modalOpen) {
      queueMicrotask(() => {
        setModalVideoIdx(videoIndex);
      });
    }
  }, [modalOpen, videoIndex]);

  const src = debutVideoPublicUrl(side, item.file);

  useEffect(() => {
    queueMicrotask(() => {
      setPreviewScale(1);
    });
  }, [src]);

  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v?.videoWidth || !v.videoHeight) return;
    setPreviewScale(
      previewScaleForIntrinsicDimensions(v.videoWidth, v.videoHeight),
    );
  }, []);

  const seekToPreviewFrame = useCallback(() => {
    const v = videoRef.current;
    if (!v || inlineOpenRef.current) return;

    v.muted = true;
    const d = v.duration;
    const t =
      Number.isFinite(d) && d > 0
        ? previewTimeFromDuration(d)
        : 0.1;

    const onSeeked = () => {
      v.removeEventListener("seeked", onSeeked);
      if (inlineOpenRef.current) return;
      v.pause();
    };

    v.addEventListener("seeked", onSeeked);
    v.currentTime = t;
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    if (inlineOpen) {
      return;
    }

    v.muted = true;
    v.pause();

    const onLoaded = () => {
      seekToPreviewFrame();
    };

    if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      onLoaded();
    } else {
      v.addEventListener("loadeddata", onLoaded);
    }

    return () => {
      v.removeEventListener("loadeddata", onLoaded);
    };
  }, [inlineOpen, src, seekToPreviewFrame]);

  useEffect(() => {
    if (!modalOpen || !isMdUp) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [modalOpen, isMdUp]);

  useEffect(() => {
    if (!modalOpen) {
      modalVideoRef.current?.pause();
      return;
    }
    if (!isMdUp) return;
    queueMicrotask(() => {
      const el = modalVideoRef.current;
      if (el) {
        void el.play().catch(() => {
          /* автоплей може бути заблокований */
        });
      }
    });
  }, [modalOpen, isMdUp, modalVideoIdx]);

  const goModalPrev = useCallback(() => {
    setModalVideoIdx((i) => Math.max(0, i - 1));
  }, []);

  const goModalNext = useCallback(() => {
    setModalVideoIdx((i) => Math.min(allVideos.length - 1, i + 1));
  }, [allVideos.length]);

  useEffect(() => {
    if (!modalOpen) return;
    const maxIdx = allVideos.length - 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalOpen(false);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setModalVideoIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setModalVideoIdx((i) => Math.min(maxIdx, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, allVideos.length]);

  const modalItem = allVideos[modalVideoIdx] ?? item;
  const modalSrc = debutVideoPublicUrl(side, modalItem.file);
  const canModalPrev = modalVideoIdx > 0;
  const canModalNext = modalVideoIdx < allVideos.length - 1;

  const handleToggle = useCallback(() => {
    if (isMdUp) {
      setModalOpen((prev) => !prev);
      return;
    }
    if (inlineOpen) {
      setInlineOpen(false);
      return;
    }
    setInlineOpen(true);
    queueMicrotask(() => {
      const v = videoRef.current;
      if (v) {
        void v.play().catch(() => {});
      }
    });
  }, [isMdUp, inlineOpen]);

  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleToggle();
      }
    },
    [handleToggle],
  );

  const handleVideoClick = useCallback((e: React.MouseEvent<HTMLVideoElement>) => {
    if (inlineOpen && !isMdUp) {
      e.stopPropagation();
    }
  }, [inlineOpen, isMdUp]);

  const cardVideoControls = inlineOpen && !isMdUp;
  const cardVideoMuted = isMdUp ? true : !inlineOpen;

  const modal = mounted && modalOpen && isMdUp && (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${videoId}-modal-title`}
      onClick={() => setModalOpen(false)}
    >
      <div
        className="relative z-10 w-full max-w-4xl rounded-2xl border border-border bg-card p-4 shadow-xl ring-1 ring-border/60 dark:bg-card/95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2
            id={`${videoId}-modal-title`}
            className="text-lg font-semibold leading-snug text-foreground"
          >
            {modalItem.title}
          </h2>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="shrink-0 rounded-lg border border-border/70 bg-secondary/90 p-2 text-foreground shadow-sm transition-colors hover:bg-muted dark:bg-secondary/60"
            aria-label="Закрити відео"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goModalPrev();
            }}
            disabled={!canModalPrev}
            className="absolute left-2 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border/80 bg-card/95 text-foreground shadow-md ring-1 ring-border/40 backdrop-blur-sm transition-[opacity,colors] hover:bg-card hover:text-primary disabled:pointer-events-none disabled:opacity-35 dark:bg-card/90"
            aria-label="Попереднє відео"
          >
            <ChevronLeft className="size-7" aria-hidden />
          </button>
          <video
            key={`${modalItem.id}-${modalVideoIdx}`}
            ref={modalVideoRef}
            className="aspect-video w-full rounded-xl bg-black object-contain ring-1 ring-border/40"
            src={modalSrc}
            controls
            playsInline
            preload="metadata"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goModalNext();
            }}
            disabled={!canModalNext}
            className="absolute right-2 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border/80 bg-card/95 text-foreground shadow-md ring-1 ring-border/40 backdrop-blur-sm transition-[opacity,colors] hover:bg-card hover:text-primary disabled:pointer-events-none disabled:opacity-35 dark:bg-card/90"
            aria-label="Наступне відео"
          >
            <ChevronRight className="size-7" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <article
        tabIndex={0}
        aria-label={`${item.title}. Натисни, щоб ${viewing ? "закрити" : "відкрити"} відео.`}
        onClick={handleToggle}
        onKeyDown={handleCardKeyDown}
        className={`flex h-full min-h-0 w-full max-w-full cursor-pointer flex-col overflow-hidden rounded-2xl border shadow-sm ring-1 transition-[transform,box-shadow,border-color,background-color,ring-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          viewing
            ? "border-primary/40 bg-primary/[0.07] ring-primary/30 dark:bg-primary/9 dark:ring-primary/35"
            : "border-border/80 bg-card/90 ring-border/50 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-black/10 hover:ring-primary/20 dark:bg-card/70 dark:ring-border/40 dark:hover:border-primary/35 dark:hover:bg-card/85 dark:hover:shadow-black/40 dark:hover:ring-primary/25"
        }`}
      >
        <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-muted">
          <video
            id={videoId}
            ref={videoRef}
            onClick={handleVideoClick}
            className={`absolute inset-0 h-full w-full object-cover object-center transition-transform duration-200 ease-out ${
              cardVideoControls ? "pointer-events-auto" : "pointer-events-none"
            }`}
            style={{
              transform:
                !isMdUp && inlineOpen ? "scale(1)" : `scale(${previewScale})`,
              transformOrigin: "center center",
            }}
            src={src}
            muted={cardVideoMuted}
            playsInline
            controls={cardVideoControls}
            preload="auto"
            onLoadedMetadata={handleLoadedMetadata}
          />
          {!cardVideoControls ? (
            <div
              className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-border/20"
              aria-hidden
            />
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="flex shrink-0 flex-col gap-2">
            {item.recommended ? (
              <span className="w-fit max-w-full rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium leading-tight text-primary ring-1 ring-primary/20">
                Корисно для сильного старту
              </span>
            ) : null}
            <h2 className="min-w-0 text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg">
              {item.title}
            </h2>
          </div>
          <div
            className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]"
            role="region"
            aria-label="Опис відео"
          >
            <p className="text-sm leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          </div>
        </div>
      </article>
      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
