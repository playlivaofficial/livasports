import { M2SportsPage } from '@/components/sports/M2SportsPage';
import { routeMetadata } from '@/config/metadata';
export const metadata = routeMetadata('br', 'live');
export default function Page() { return <M2SportsPage locale="br" page="live" />; }
