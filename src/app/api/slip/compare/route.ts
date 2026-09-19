import {compareSlipRequest} from '@/slip/comparison-server';
import {withRequestLimit} from '@/security/request-limit';
export const POST=withRequestLimit('slip',compareSlipRequest);
