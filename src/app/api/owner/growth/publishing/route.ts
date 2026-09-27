import {growthPublishingHistory} from '@/growth/owner-server';
import {withRequestLimit} from '@/security/request-limit';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=withRequestLimit('owner',growthPublishingHistory);
