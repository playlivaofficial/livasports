'use client';

import Image from 'next/image';
import { useState } from 'react';

function safePlayerImage(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'cdn.sportmonks.com' ? url.toString() : null;
  } catch { return null; }
}

export function PlayerAvatar({ name, imageUrl, large = false }: { name: string; imageUrl?: string | null; large?: boolean }) {
  const safeUrl = safePlayerImage(imageUrl);
  const [available, setAvailable] = useState(Boolean(safeUrl));
  const parts = name.trim().split(/\s+/);
  const initials = (parts.length > 1 ? [parts[0], parts.at(-1)] : parts).map(item => item?.[0] ?? '').join('').toUpperCase();
  return <span className={`player-avatar${large ? ' is-large' : ''}`}>
    {safeUrl && available ? <Image src={safeUrl} width={large ? 84 : 36} height={large ? 84 : 36} alt={large ? name : ''}
      loading={large ? 'eager' : 'lazy'} onError={() => setAvailable(false)}/> : initials}
  </span>;
}
