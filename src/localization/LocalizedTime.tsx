'use client';
import {useTimePreference} from './TimeZoneSelector';
import {languageTags,type InterfaceLocale} from './interface';
import {resolveTimeZone} from './time-zone';

/** Cached HTML uses the route's default zone; private preferences hydrate in the browser. */
export function useTimeZone(locale:InterfaceLocale,fallbackTimeZone?:string){
  const {manual,device}=useTimePreference();
  return manual||device?resolveTimeZone(locale,manual,device):fallbackTimeZone??resolveTimeZone(locale,null,null);
}
export function LocalizedTimeText({value,locale,options,fallbackTimeZone}:{value:string;locale:InterfaceLocale;options:Intl.DateTimeFormatOptions;fallbackTimeZone?:string}){
  const timeZone=useTimeZone(locale,fallbackTimeZone),date=new Date(value);
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(languageTags[locale],{...options,timeZone}).format(date):'—';
}
