import { M2SportsPage } from '@/components/sports/M2SportsPage';
import { routeMetadata } from '@/config/metadata';
export const metadata = routeMetadata('br', 'football');
export default function Page() { return <M2SportsPage locale="br" page="football" />; }
