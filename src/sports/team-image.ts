/** Only licensed, team-specific Sportmonks artwork is a crest. Generic CDN shields are not. */
export function verifiedTeamImage(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'cdn.sportmonks.com' || url.username || url.password) return null;
    if (!/^\/images\/soccer\/teams\/[^/]+\/\d+\.(png|webp|jpe?g)$/i.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
