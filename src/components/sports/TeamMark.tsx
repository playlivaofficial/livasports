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

export function TeamMark({ initials, imageUrl }: { initials: string; imageUrl?: string | null }) {
  const safeUrl = safeSportmonksImage(imageUrl);
  const [imageAvailable, setImageAvailable] = useState(Boolean(safeUrl));

  return <span className="team-mark" aria-hidden="true">
    <span>{initials}</span>
    {safeUrl && imageAvailable ? <Image className="team-logo" src={safeUrl} width={26} height={26} alt="" loading="lazy" onError={() => setImageAvailable(false)} /> : null}
  </span>;
}
