'use client';

import Image from 'next/image';
import { useState } from 'react';
import { verifiedTeamImage } from '@/sports/team-image';

export function TeamMark({ initials, imageUrl, size=26 }: { initials: string; imageUrl?: string | null; size?:26|80|104 }) {
  const safeUrl = verifiedTeamImage(imageUrl);
  // A failed old URL must not suppress a subsequently repaired, verified crest.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return <span className="team-mark" aria-hidden="true">
    <span>{initials}</span>
    {safeUrl && safeUrl !== failedUrl ? <Image className="team-logo" src={safeUrl} width={size} height={size} alt="" loading={size===26?'lazy':'eager'} onError={() => setFailedUrl(safeUrl)} /> : null}
  </span>;
}
