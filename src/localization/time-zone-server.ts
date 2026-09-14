import 'server-only';
import {cookies} from 'next/headers';
import {cache} from 'react';
import type {InterfaceLocale} from './interface';
import {deviceTimeZoneCookie,resolveTimeZone,timeZoneCookie,validTimeZone} from './time-zone';

export const requestTimePreference=cache(async(locale:InterfaceLocale)=>{
  const jar=await cookies();
  const manual=validTimeZone(jar.get(timeZoneCookie)?.value),device=validTimeZone(jar.get(deviceTimeZoneCookie)?.value);
  return {timeZone:resolveTimeZone(locale,manual,device),manual,device};
});
export async function requestTimeZone(locale:InterfaceLocale){return (await requestTimePreference(locale)).timeZone;}
