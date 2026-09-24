import type {GrowthVoiceMode} from './config';

/**
 * Natural Voice V1 — Brazilian Portuguese spoken-text shaping.
 *
 * On-screen copy is written to be read: separators (·, •), abbreviations (sáb., 3º, G4), dates
 * (27/09) and clock times (16:00). Sent verbatim to a speech model, that is exactly what makes a
 * narration sound machine-made — "sáb ponto", "três ó", "dezesseis dois-pontos zero zero". This
 * module rewrites a caption into what a Brazilian football presenter would actually say, and shapes
 * it into short spoken beats for the mode.
 *
 * Pure and deterministic: the same caption always yields the same spoken line, which is what lets
 * the narration cache recognise unchanged audio and never pay for it twice.
 */

const UNITS=['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','catorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const TENS=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const HUNDREDS=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
/** Cardinal in words, 0–999 (larger numbers are left as digits, which the model reads correctly). */
export function cardinal(value:number,feminine=false):string{
  if(!Number.isInteger(value)||value<0||value>999)return String(value);
  const fem=(word:string)=>feminine?word.replace(/^um$/,'uma').replace(/^dois$/,'duas').replace(/entos$/,'entas'):word;
  if(value<20)return fem(UNITS[value]!);
  if(value<100){const tens=TENS[Math.floor(value/10)]!,unit=value%10;return unit?`${tens} e ${fem(UNITS[unit]!)}`:tens;}
  if(value===100)return 'cem';
  const hundreds=fem(HUNDREDS[Math.floor(value/100)]!),rest=value%100;
  return rest?`${hundreds} e ${cardinal(rest,feminine)}`:hundreds;
}
const ORD_UNITS=['','primeiro','segundo','terceiro','quarto','quinto','sexto','sétimo','oitavo','nono'];
const ORD_TENS=['','décimo','vigésimo','trigésimo','quadragésimo'];
/** Masculine ordinal, 1–49: table positions ("3º" → "terceiro"). */
export function ordinal(value:number,feminine=false):string{
  if(!Number.isInteger(value)||value<1||value>49)return String(value);
  const word=[ORD_TENS[Math.floor(value/10)],ORD_UNITS[value%10]].filter(Boolean).join(' ');
  return feminine?word.replace(/o\b/g,'a'):word;
}

const WEEKDAYS:Record<string,string>={dom:'domingo',seg:'segunda',ter:'terça',qua:'quarta',qui:'quinta',sex:'sexta','sáb':'sábado',sab:'sábado'};
const MONTHS=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
/** "16:00" → "às dezesseis horas"; "21:30" → "às vinte e uma e trinta". Hours agree with "hora" (feminine). */
export function spokenClock(hours:number,minutes:number):string{
  if(hours===0&&minutes===0)return 'à meia-noite';
  if(hours===12&&minutes===0)return 'ao meio-dia';
  const h=cardinal(hours,true),lead=hours===1?'à':'às';
  return minutes?`${lead} ${h} e ${cardinal(minutes)}`:`${lead} ${h} ${hours===1?'hora':'horas'}`;
}

/**
 * Club names as a presenter says them. Provider display names carry state suffixes and legal forms
 * that no narrator would read out loud.
 */
const CLUB_SPOKEN:ReadonlyArray<readonly [RegExp,string]>=[
  [/\bAtl[ée]tico[- ]MG\b/gi,'Atlético Mineiro'],[/\bAthletico[- ]PR\b/gi,'Athletico Paranaense'],[/\bAtl[ée]tico[- ]PR\b/gi,'Athletico Paranaense'],
  [/\bAtl[ée]tico[- ]GO\b/gi,'Atlético Goianiense'],[/\bAm[ée]rica[- ]MG\b/gi,'América Mineiro'],[/\bRB Bragantino\b/g,'Bragantino'],[/\bRed Bull Bragantino\b/g,'Bragantino'],
  [/\bS[ãa]o Paulo FC\b/g,'São Paulo'],[/\bClube de Regatas do Flamengo\b/g,'Flamengo'],[/\bSport Club Corinthians Paulista\b/g,'Corinthians'],
  [/\bSociedade Esportiva Palmeiras\b/g,'Palmeiras'],[/\bCR Vasco da Gama\b/g,'Vasco'],[/\bGr[êe]mio FBPA\b/g,'Grêmio'],[/\bEC Bahia\b/g,'Bahia'],
  [/\bBotafogo FR\b/g,'Botafogo'],[/\bFluminense FC\b/g,'Fluminense'],[/\bSC Internacional\b/g,'Internacional'],[/\bCeará SC\b/g,'Ceará'],
  [/\bFortaleza EC\b/g,'Fortaleza'],[/\bEC Vitória\b/g,'Vitória'],[/\bEC Juventude\b/g,'Juventude'],
  [/\bBayern M[üu]nchen\b/g,'Bayern de Munique'],[/\bFC Bayern\b/g,'Bayern'],[/\bInter Milan\b/g,'Inter de Milão'],[/\bAC Milan\b/g,'Milan'],
  [/\bPSG\b/g,'Paris Saint-Germain'],[/\bManchester Utd\b/g,'Manchester United'],
];
const COMPETITION_SPOKEN:ReadonlyArray<readonly [RegExp,string]>=[
  [/\bUEFA Champions League\b/g,'Champions League'],[/\bUEFA Europa League\b/g,'Liga Europa'],[/\bEuropa League\b/g,'Liga Europa'],
  [/\bUEFA Conference League\b/g,'Conference League'],[/\bCONMEBOL Libertadores\b/g,'Libertadores'],[/\bCONMEBOL Sudamericana\b/g,'Sul-Americana'],
  [/\bCopa Sudamericana\b/g,'Copa Sul-Americana'],[/\bSerie A\b/g,'Série A'],[/\bBrasileir[ãa]o S[ée]rie A\b/g,'Brasileirão'],[/\bBrasileir[ãa]o S[ée]rie B\b/g,'Série B do Brasileirão'],
];
/** Feminine nouns that change "1"/"2" to "uma"/"duas". */
const FEMININE_NOUN=/^(posiç(?:ão|ões)|casas?|vez(?:es)?|rodadas?|partidas?|vitórias?|derrotas?|horas?|odds?|opç(?:ão|ões)|apostas?|finais?|semanas?)\b/i;

export interface SpokenOptions {mode:GrowthVoiceMode;/** First line of the video: the hook gets its energy from punctuation, not from shouting. */hook?:boolean;}

/** Rewrite one on-screen line into the sentence a Brazilian presenter would say. */
export function spokenLine(text:string,options:SpokenOptions):string{
  let line=text.normalize('NFC').trim();
  if(!line)return '';
  // Web and social artefacts are never read aloud.
  line=line.replace(/https?:\/\/\S+/g,'').replace(/#\w+/g,'').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'');
  line=line.replace(/\bLivaSports\.com\b/gi,'Liva Sports ponto com').replace(/\bPlayLiva\.com\b/gi,'Play Liva ponto com').replace(/\bLivaSports\b/g,'Liva Sports');
  for(const [pattern,spoken] of CLUB_SPOKEN)line=line.replace(pattern,spoken);
  for(const [pattern,spoken] of COMPETITION_SPOKEN)line=line.replace(pattern,spoken);
  // Kickoff: "sáb. · 27/09, 16:00" / "sáb., 27/09 16:00" → "sábado, dia vinte e sete, às dezesseis horas".
  line=line.replace(/\b(dom|seg|ter|qua|qui|sex|s[áa]b)\.?,?\s*(?:·\s*)?(\d{1,2})\/(\d{1,2}),?\s*(\d{1,2})[:h](\d{2})/gi,(_,day:string,date:string,_month:string,h:string,m:string)=>
    `${WEEKDAYS[day.toLowerCase()]??day}, dia ${cardinal(Number(date))}, ${spokenClock(Number(h),Number(m))}`);
  line=line.replace(/\b(\d{1,2})\/(\d{1,2})\b/g,(_,day:string,month:string)=>{const m=Number(month);return m>=1&&m<=12?`${cardinal(Number(day))} de ${MONTHS[m-1]}`:`${day} de ${month}`;});
  line=line.replace(/\b(\d{1,2})(?::(\d{2})|h(\d{2})?)(?=\W|$)/g,(_,h:string,m1?:string,m2?:string)=>spokenClock(Number(h),Number(m1??m2??0)).replace(/^às? /,'').replace(/^ao /,''));
  line=line.replace(/\bhorário de Brasília\b/gi,'no horário de Brasília');
  // Table language.
  line=line.replace(/\bG-?(\d)\b/g,(_,n:string)=>`gê ${cardinal(Number(n))}`).replace(/\bZ-?\d\b/g,'zona de rebaixamento');
  line=line.replace(/\b(\d{1,2})[º°]\s*(lugar|colocado|posição)?/g,(_,n:string,noun?:string)=>noun==='posição'?`${ordinal(Number(n),true)} posição`:`${ordinal(Number(n))}${noun?` ${noun}`:''}`);
  line=line.replace(/\b(\d{1,2})[ªa]\s+(rodada|posição|colocação)\b/g,(_,n:string,noun:string)=>`${ordinal(Number(n),true)} ${noun}`);
  line=line.replace(/\bRodada (\d{1,2})\b/g,(_,n:string)=>`${ordinal(Number(n),true)} rodada`);
  // Markets and separators.
  line=line.replace(/\b1\s*[xX]\s*2\b/g,'um, xis, dois').replace(/\bvs\.?\b/gi,'contra');
  // "Flamengo x Palmeiras" is said "Flamengo e Palmeiras" by nobody — "Flamengo contra Palmeiras" by everyone.
  line=line.replace(/(\S)\s+x\s+(\S)/g,'$1 contra $2');
  line=line.replace(/\s*[·•|]\s*/g,', ').replace(/\s*—\s*/g,', ').replace(/\s*;\s*/g,'. ');
  line=line.replace(/\bnº\s*/gi,'número ').replace(/\bpts\b/gi,'pontos').replace(/\bjogs\b/gi,'jogos');
  // Remaining small integers, with gender agreement for the noun that follows.
  // Decimals (prices such as 1,85) are left to the model; only whole numbers become words.
  line=line.replace(/(?<![\d.,])(\d{1,3})(?![\d]|[.,]\d)(\s+(\S+))?/g,(_,n:string,tail?:string,next?:string)=>
    `${cardinal(Number(n),!!next&&FEMININE_NOUN.test(next))}${tail??''}`);
  line=line.replace(/\s{2,}/g,' ').replace(/\s+([,.!?:])/g,'$1').replace(/,\s*,/g,',').replace(/^[,.\s]+/,'').trim();
  return shapeBeats(line,options);
}

/**
 * Spoken beats. ENERGETIC wants short sentences that land; EDITORIAL wants measured sentences with
 * room to breathe. Long run-on captions are split at their natural joints (colon, "e", "mas") rather
 * than truncated, and every line ends on terminal punctuation so the model resolves its intonation
 * instead of trailing off — the "unfinished sentence" sound that gives synthetic narration away.
 */
export function shapeBeats(line:string,options:SpokenOptions):string{
  if(!line)return '';
  const limit=options.mode==='ENERGETIC'?70:110;
  let shaped=line;
  // A colon in a headline is a beat: "Para tudo: tem jogaço" → "Para tudo! Tem jogaço."
  shaped=shaped.replace(/:\s+(\p{L})/gu,(_,letter:string)=>`${options.mode==='ENERGETIC'&&options.hook?'!':'.'} ${letter.toUpperCase()}`);
  const sentences=shaped.split(/(?<=[.!?])\s+/).flatMap(sentence=>{
    if(sentence.length<=limit)return [sentence];
    // Split long sentences at a comma nearest the middle.
    const commas=[...sentence.matchAll(/,\s/g)].map(match=>match.index!);
    if(!commas.length)return [sentence];
    const cut=commas.reduce((best,index)=>Math.abs(index-sentence.length/2)<Math.abs(best-sentence.length/2)?index:best);
    const first=sentence.slice(0,cut),second=sentence.slice(cut+2);
    return [`${first}.`,second.charAt(0).toUpperCase()+second.slice(1)];
  });
  const joined=sentences.map(sentence=>sentence.trim()).filter(Boolean).join(' ');
  const terminal=/[.!?…]$/.test(joined)?'':options.mode==='ENERGETIC'&&options.hook?'!':'.';
  return (joined.charAt(0).toUpperCase()+joined.slice(1)+terminal).replace(/!\./g,'!').replace(/\.\./g,'.');
}
