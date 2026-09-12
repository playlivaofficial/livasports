// Fixed decimal strings + BigInt: no per-quote rounding or floating point product.
function decimal(value:string):{units:bigint;scale:number}|null {
  if(!/^\d{1,4}(?:\.\d{1,18})?$/.test(value))return null;
  const [whole,fraction='']=value.split('.');
  return {units:BigInt(whole+fraction),scale:fraction.length};
}
export function validDecimalOdds(value:string):boolean {
  const d=decimal(value);if(!d)return false;
  const one=10n**BigInt(d.scale);return d.units>one&&d.units<=1000n*one;
}
function stringify(units:bigint,scale:number):string {
  if(!scale)return String(units);
  const digits=String(units).padStart(scale+1,'0');
  return `${digits.slice(0,-scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/,'');
}
export function multiplyDecimalOdds(values:readonly string[]):string|null {
  if(!values.length||values.length>10)return null;
  let units=1n,scale=0;
  for(const value of values){if(!validDecimalOdds(value))return null;const d=decimal(value)!;units*=d.units;scale+=d.scale;}
  return stringify(units,scale);
}
export function compareDecimal(a:string,b:string):number {
  const [aw,af='']=a.split('.'),[bw,bf='']=b.split('.');const scale=Math.max(af.length,bf.length);
  const left=BigInt(aw+af.padEnd(scale,'0')),right=BigInt(bw+bf.padEnd(scale,'0'));
  return left>right?1:left<right?-1:0;
}
export function formatCombinedOdds(value:string,locale:'br'|'mx'):string {
  const [whole,fraction='']=value.split('.');
  const padded=fraction.padEnd(3,'0');
  const cents=BigInt(whole)*100n+BigInt(padded.slice(0,2))+(padded[2]>='5'?1n:0n);
  const language=locale==='br'?'pt-BR':'es-MX';
  const separator=locale==='br'?',':'.';
  return `${new Intl.NumberFormat(language,{maximumFractionDigits:0}).format(cents/100n)}${separator}${String(cents%100n).padStart(2,'0')}`;
}
