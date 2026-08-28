"use client";

/* eslint-disable @next/next/no-img-element -- protected solution URLs cannot use the image optimizer. */
import type { SyntheticEvent } from "react";

import { solutionImageMaxDisplayWidth } from "@/lib/solution-image";

export function SolutionImage({ src, alt }: { src: string; alt: string }) {
  function applyIntrinsicWidthLimit(event: SyntheticEvent<HTMLImageElement>) {
    setIntrinsicWidthLimit(event.currentTarget);
  }

  function applyCachedImageWidthLimit(image: HTMLImageElement | null) {
    if (image?.complete) setIntrinsicWidthLimit(image);
  }

  function setIntrinsicWidthLimit(image: HTMLImageElement) {
    const maxDisplayWidth = solutionImageMaxDisplayWidth(image.naturalWidth);
    if (maxDisplayWidth === null) return;

    image.style.width = "100%";
    image.style.maxWidth = `${maxDisplayWidth}px`;
  }

  return <img ref={applyCachedImageWidthLimit} className="solution-image" src={src} alt={alt} onLoad={applyIntrinsicWidthLimit} />;
}
