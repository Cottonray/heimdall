import { useState } from "react";

/** Inline evidence retains its aspect ratio and links to the full-resolution image. */
export function EvidencePreview({ src, step }: { src: string; step: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      aria-label={`${step}단계 화면 증적 원본 보기`}
      className="block w-fit max-w-full shrink-0 overflow-hidden rounded-md border bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {failed ? (
        <span className="block p-3 text-sm text-muted-foreground">
          이미지를 불러오지 못했어요. 원본 보기
        </span>
      ) : (
        <img
          src={src}
          alt={`${step}단계 실행 후 화면 증적`}
          loading="lazy"
          decoding="async"
          className="block h-auto max-h-144 w-auto max-w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </a>
  );
}
