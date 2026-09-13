import type {PageKey,SiteLocale} from '@/config/i18n';
import type {BoardQuery} from './board-policy';
import {SportsBoardPage} from './SportsBoardPage';
export function M2SportsPage(props:{locale:SiteLocale;page:PageKey;searchParams?:Promise<BoardQuery>}){return <SportsBoardPage {...props}/>;}
