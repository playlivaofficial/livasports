'use client';
import {SlipShell} from '@/components/slip/SlipShell';
import type {SiteLocale} from '@/config/i18n';
export function LegacyPageShell({commercialLocale=null}:{commercialLocale?:SiteLocale|null}){return <SlipShell commercialLocale={commercialLocale}/>;}
