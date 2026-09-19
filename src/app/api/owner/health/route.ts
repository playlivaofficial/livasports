import {ownerHealthAction,ownerHealthStatus} from '@/owner/health-server';
import {withRequestLimit} from '@/security/request-limit';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=withRequestLimit('owner',ownerHealthStatus);
export const POST=withRequestLimit('owner',ownerHealthAction);
