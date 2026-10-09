import {selectSlipRequest} from '@/slip/admission-server';
import {withRequestLimit} from '@/security/request-limit';
export const POST=withRequestLimit('slip',selectSlipRequest);
