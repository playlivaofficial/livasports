'use client';

import Image from 'next/image';
import { useState } from 'react';

function safeSportmonksImage(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'cdn.sportmonks.com' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function TeamMark({ initials, imageUrl, size=26 }: { initials: string; imageUrl?: string | null; size?:26|80|104 }) {
  const safeUrl = safeSportmonksImage(imageUrl);
  const [imageAvailable, setImageAvailable] = useState(Boolean(safeUrl));

  return <span className="team-mark" aria-hidden="true">
    <span>{initials}</span>
    {safeUrl && imageAvailable ? <Image className="team-logo" src={safeUrl} width={size} height={size} alt="" loading={size===26?'lazy':'eager'} onError={() => setImageAvailable(false)} /> : null}
  </span>;
}
