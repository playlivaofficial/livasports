'use client';
import {useTimeZone} from '@/localization/LocalizedTime';
import type {InterfaceLocale} from '@/localization/interface';

export function MatchTimeZone({locale,fallbackTimeZone}:{locale:InterfaceLocale;fallbackTimeZone:string}) {
  return <>{useTimeZone(locale,fallbackTimeZone).replaceAll('_',' ')}</>;
}
