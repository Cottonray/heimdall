import type { Step } from "../../../../contracts/studio";
import { useState } from "react";

/** Inline evidence retains its aspect ratio and links to the full-resolution image. */
export function EvidencePreview({ src, step, fill = false, target }: { src: string; step: number; fill?: boolean; target?: Step["target"] }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      aria-label={`${step}단계 화면 증적 원본 보기`}
      className={fill ? "relative block min-h-0 w-full flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring" : "block w-fit max-w-full shrink-0 overflow-hidden rounded-md border bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-ring"}
    >
      {failed ? (
        <span className="block p-3 text-sm text-muted-foreground">
          이미지를 불러오지 못했어요. 원본 보기
        </span>
      ) : (
        <>
        <img
          src={src}
          alt={`${step}단계 ${target ? "조작 대상" : "실행 후"} 화면 증적`}
          loading="lazy"
          decoding="async"
          className={fill ? "absolute inset-0 block h-full w-full object-contain object-left-top" : "block h-auto max-h-144 w-auto max-w-full object-contain"}
          onError={() => setFailed(true)}
        />
        {target && fill && <svg aria-label="조작 대상 위치" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${target.screenWidth} ${target.screenHeight}`} preserveAspectRatio="xMinYMin meet">
          <rect x={Math.max(0,target.x)} y={Math.max(0,target.y)} width={target.width} height={target.height} fill="none" stroke="#ef4444" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </svg>}
        </>
      )}
    </a>
  );
}
