"use client";

import React from "react";

type Props = {
  previewPhoto: string | null;
  setPreviewPhoto: (v: string | null) => void;
};

export default function ImageViewer({
  previewPhoto,
  setPreviewPhoto
}: Props) {

  if (!previewPhoto) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[999]"
      onClick={() => setPreviewPhoto(null)}
    >
      <img
        src={previewPhoto}
        className="max-w-[95%] max-h-[95%] object-contain rounded"
      />
    </div>
  );
}