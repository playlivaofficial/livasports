import {offersRequest} from '@/affiliate/server';
import {withRequestLimit} from '@/security/request-limit';
export const POST=withRequestLimit('read',offersRequest);
