'use client';
import {usePathname} from 'next/navigation';
import {SlipShell} from '@/components/slip/SlipShell';
// English is the new sports-only surface. Existing modules and their canonical
// browser storage are unchanged and resume on the existing BR/MX routes.
export function LegacyPageShell(){const pathname=usePathname();return pathname==='/en'||pathname.startsWith('/en/')?null:<SlipShell/>;}
