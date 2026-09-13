import { M2SportsPage } from '@/components/sports/M2SportsPage';
import { routeMetadata } from '@/config/metadata';
export const metadata = routeMetadata('mx', 'today');
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { return <M2SportsPage searchParams={searchParams} locale="mx" page="today" />; }
