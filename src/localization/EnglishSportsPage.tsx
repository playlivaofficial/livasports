import type {PageKey} from '@/config/i18n';
import type {BoardQuery} from '@/components/sports/board-policy';
import {SportsBoardPage} from '@/components/sports/SportsBoardPage';
export function EnglishSportsPage(props:{page:PageKey;searchParams?:Promise<BoardQuery>}){return <SportsBoardPage locale="en" {...props}/>;}
