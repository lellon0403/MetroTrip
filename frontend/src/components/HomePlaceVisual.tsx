"use client";

import Image from "next/image";
import { useState } from "react";

type HomePlaceVisualProps = {
  category: string;
  imageUrl?: string | null;
  label: string;
};

export function HomePlaceVisual({ category, imageUrl, label }: HomePlaceVisualProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl && failedUrl !== imageUrl);

  return (
    <span className={`homePlaceVisual ${category.toLowerCase()}${showImage ? " hasImage" : ""}`}>
      {showImage && imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : null}
      <b>{label}</b>
    </span>
  );
}
