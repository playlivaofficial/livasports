/**
 * P2 — brand Open Graph image shared by every page. Next.js replaces a parent's `openGraph`
 * object when a page defines its own, so the root file-convention image must be repeated here.
 * `/opengraph-image.png` is the static file-convention route in `src/app`.
 */
export const brandOpenGraphImage={url:'https://livasports.com/opengraph-image.png',width:1200,height:630,alt:'LivaSports — football stories, guides and tools'} as const;
export function openGraphImages(entity?:{url:string;alt:string}|null){
  return entity?[{url:entity.url,alt:entity.alt},brandOpenGraphImage]:[brandOpenGraphImage];
}
