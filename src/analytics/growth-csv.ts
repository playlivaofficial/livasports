/**
 * CSV for owner exports. Cells that a spreadsheet would execute (=, +, -, @, tab, CR) are prefixed
 * with an apostrophe unless they are plain numbers, so an attacker-controlled landing path or UTM value
 * can never become a formula in the owner's spreadsheet.
 */
export interface CsvColumn<T> {key:string;label:string;value:(row:T)=>string|number|null|undefined;}
export function csvCell(value:string|number|null|undefined):string{
  if(value===null||value===undefined)return '';
  if(typeof value==='number')return Number.isFinite(value)?String(value):'';
  let text=value;
  if(/^[=+\-@\t\r]/.test(text)&&!/^-?\d+(\.\d+)?$/.test(text))text=`'${text}`;
  return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}
export function toCsv<T>(rows:readonly T[],columns:readonly CsvColumn<T>[]):string{
  return [columns.map(column=>csvCell(column.label)).join(','),...rows.map(row=>columns.map(column=>csvCell(column.value(row))).join(','))].join('\r\n')+'\r\n';
}
