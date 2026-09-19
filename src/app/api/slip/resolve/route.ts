import {resolveSlipRequest} from '@/slip/server';
import {withRequestLimit} from '@/security/request-limit';
export const runtime='nodejs';
export const POST=withRequestLimit('slip',resolveSlipRequest);
