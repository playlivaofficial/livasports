// Intercept only the sentinel. All application modules and other imports still
// use their normal resolution; no React/Next.js export conditions are changed.
export function resolve(specifier,context,nextResolve) {
  if(specifier==='server-only') {
    return {url:'data:text/javascript,export {};',shortCircuit:true};
  }
  return nextResolve(specifier,context);
}
