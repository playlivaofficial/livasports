/** Isolated QA login only. Verify the destination before constructing any credential-bearing request. */
export async function ownerBrowserLogin(page,expectedOrigin,key){
 if(!/^https:\/\/livasports\.com$|^https:\/\/livasports-[a-z0-9]+-nikapopkha3-4447s-projects\.vercel\.app$|^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(expectedOrigin))throw Error('OWNER_DESTINATION_NOT_ALLOWED');
 if(await page.evaluate('location.origin')!==expectedOrigin)throw Error('OWNER_CREDENTIAL_DESTINATION_MISMATCH');
 if(typeof key!=='string'||!key.trim())throw Error('OWNER_CREDENTIAL_UNAVAILABLE');
 // Absolute destination + same-origin mode also closes navigation races after the check.
 // Never inspect or export session cookies, private browser profiles or response bodies.
 return page.evaluate(`fetch(${JSON.stringify(expectedOrigin+'/api/owner/preview')},{method:'POST',mode:'same-origin',redirect:'error',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',key:${JSON.stringify(key)}})}).then(r=>r.status)`);
}
