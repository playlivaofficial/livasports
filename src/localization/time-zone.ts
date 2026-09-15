import type {InterfaceLocale} from './interface';

export const timeZoneCookie='livasports_time_zone';
export const deviceTimeZoneCookie='livasports_device_time_zone';
export function validTimeZone(value:unknown):string|null{
  if(typeof value!=='string'||value.length>80||!(/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)*$/).test(value))return null;
  try{return new Intl.DateTimeFormat('en',{timeZone:value}).resolvedOptions().timeZone;}catch{return null;}
}
export function resolveTimeZone(locale:InterfaceLocale,manual:unknown,device:unknown):string{
  return validTimeZone(manual)??validTimeZone(device)??(locale==='br'?'America/Sao_Paulo':locale==='mx'?'America/Mexico_City':'UTC');
}
export function safeTimeZoneReturn(input:unknown):string{
  if(typeof input!=='string'||input.length>2048||!/^\/(br|mx|en)(?:\/|\?|#|$)/.test(input)||/[\\\u0000-\u001f\u007f]/.test(input))return '/en';
  return input;
}
