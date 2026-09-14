// Fixed decimal strings + BigInt: no per-quote rounding or floating point product.
export const DEFAULT_STAKE='10';
export const MAX_STAKE=1_000_000;

function decimal(value:string,wholeDigits=4):{units:bigint;scale:number}|null {
  if(!new RegExp(`^\\d{1,${wholeDigits}}(?:\\.\\d{1,18})?$`).test(value))return null;
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

/** Half-up to 2 decimal places. Combined odds 6.048 → 605 cents of the displayed price (6.05). */
export function roundHalfUpCents(value:string):bigint|null {
  const negative=value.startsWith('-');const raw=negative?value.slice(1):value;
  if(!/^\d{1,40}(?:\.\d{1,40})?$/.test(raw))return null;
  const [whole,fraction='']=raw.split('.');
  const padded=fraction.padEnd(3,'0');
  const cents=BigInt(whole)*100n+BigInt(padded.slice(0,2))+(padded[2]>='5'?1n:0n);
  return negative?-cents:cents;
}
function fromCents(cents:bigint):string {
  const sign=cents<0n?'-':'';const abs=cents<0n?-cents:cents;
  return `${sign}${abs/100n}.${String(abs%100n).padStart(2,'0')}`;
}

export function formatCombinedOdds(value:string,locale:'br'|'mx'|'en'):string {
  const cents=roundHalfUpCents(value);if(cents===null)return '—';
  const language=locale==='br'?'pt-BR':locale==='mx'?'es-MX':'en-GB';
  const separator=locale==='br'?',':'.';
  return `${new Intl.NumberFormat(language,{maximumFractionDigits:0}).format(cents/100n)}${separator}${String(cents%100n).padStart(2,'0')}`;
}

export function parseStake(raw:string):string|null {
  const trimmed=raw.trim().replace(/\s+/g,'').replace(',', '.');
  if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(trimmed))return null;
  const [wholeRaw,fraction]=trimmed.split('.');
  const whole=wholeRaw.replace(/^0+(?=\d)/,'');
  if(whole.length>7)return null;
  const normalized=fraction===undefined?whole:`${whole}.${fraction}`;
  const amount=Number(normalized);
  if(!Number.isFinite(amount)||amount<=0||amount>MAX_STAKE)return null;
  return normalized;
}

/** Informational return = stake × combined odds after the same half-up 2dp display rounding. */
export function potentialReturn(stake:string,combinedOdds:string):string|null {
  const parsed=parseStake(stake);if(!parsed)return null;
  const stakeCents=roundHalfUpCents(parsed);const oddsCents=roundHalfUpCents(combinedOdds);
  if(stakeCents===null||oddsCents===null||stakeCents<=0n||oddsCents<=100n)return null;
  return fromCents((stakeCents*oddsCents+50n)/100n);
}

export function moneyDiff(value:string,best:string):string|null {
  const left=roundHalfUpCents(value);const right=roundHalfUpCents(best);
  if(left===null||right===null)return null;
  return fromCents(left-right);
}

export function formatMoney(value:string,locale:'br'|'mx'|'en'):string {
  const cents=roundHalfUpCents(value);if(cents===null)return '—';
  const negative=cents<0n;const abs=negative?-cents:cents;
  const language=locale==='br'?'pt-BR':locale==='mx'?'es-MX':'en-GB';
  const separator=locale==='br'?',':'.';
  const amount=`${new Intl.NumberFormat(language,{maximumFractionDigits:0}).format(abs/100n)}${separator}${String(abs%100n).padStart(2,'0')}`;
  const signed=`${negative?'- ':''}${locale==='mx'?'MX$':'R$'} ${amount}`;
  return signed;
}
