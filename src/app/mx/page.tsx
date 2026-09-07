import { M2SportsPage } from '@/components/sports/M2SportsPage';
import { routeMetadata } from '@/config/metadata';
export const metadata = routeMetadata('mx', 'home');
export default function Page() { return <M2SportsPage locale="mx" page="home" />; }
