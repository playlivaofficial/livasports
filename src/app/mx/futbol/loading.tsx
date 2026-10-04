import { LoadingState } from '@/components/sports/DataStates';
// Keep this streaming boundary off canonical entity routes (real HTTP 404/308).
export default function Loading() { return <LoadingState locale="mx" />; }
