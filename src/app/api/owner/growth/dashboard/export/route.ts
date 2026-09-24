import {growthDashboardExport} from '@/owner/growth-dashboard/export';
import {withRequestLimit} from '@/security/request-limit';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=withRequestLimit('owner',growthDashboardExport);
