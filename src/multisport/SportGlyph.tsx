import type {CatalogSport} from './catalog';
/** Generic navigation symbols, never league crests or official identities. */
const paths:Record<CatalogSport,string>={
 football:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5 4 3-1.5 4h-5L8 11Zm0-5v5M3.5 9l4.5 2M6 19l3.5-4M18 19l-3.5-4M20.5 9 16 11',
 basketball:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3v18M5.5 5.5c7 3 7 10 0 13M18.5 5.5c-7 3-7 10 0 13',
 baseball:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM7 5c5 4 5 10 0 14M17 5c-5 4-5 10 0 14',
 'american-football':'M3 19C1 7 7 1 21 3c2 14-4 20-18 16ZM8 16l8-8M9 10l5 5M12 7l5 5M6 13l5 5',
 'ice-hockey':'M5 3l6 15h8v3H9L2 4M15 13h6v3h-6Z',
 mma:'M6 10V7a2 2 0 0 1 4 0V5a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v4h1v7l-3 4H8l-4-6v-3a2 2 0 0 1 2-2Z',
 tennis:'M12 3c5-2 10 3 8 8-1 4-5 6-8 4S7 7 12 3ZM10 14 3 21M12 6l6 6M10 10l6-6',
};
export function SportGlyph({sport}:{sport:CatalogSport}){return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[sport]}/></svg>;}
