import { M2SportsPage } from '@/components/sports/M2SportsPage';
import { routeMetadata } from '@/config/metadata';
export const metadata = routeMetadata('pe', 'home');
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { return <M2SportsPage searchParams={searchParams} locale='pe' page="home" />; }
