export function sameOrigin(request:Request):boolean {
  const origin=request.headers.get('origin');
  if(!origin)return false;
  try{return origin===new URL(request.url).origin;}catch{return false;}
}

export const privateCacheHeaders={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie','X-Robots-Tag':'noindex'} as const;
