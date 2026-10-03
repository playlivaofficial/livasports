import { M2SportsPage } from '@/components/sports/M2SportsPage';
import {footballMetadata} from '@/sports/metadata';
export function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return footballMetadata('pe',searchParams);}
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { return <M2SportsPage searchParams={searchParams} locale='pe' page="football" />; }
