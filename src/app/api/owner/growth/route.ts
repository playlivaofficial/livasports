import {growthOwnerAction,growthOwnerStatus} from '@/growth/owner-server';
import {withRequestLimit} from '@/security/request-limit';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;
export const GET=withRequestLimit('owner',growthOwnerStatus);
export const POST=withRequestLimit('owner',growthOwnerAction);
