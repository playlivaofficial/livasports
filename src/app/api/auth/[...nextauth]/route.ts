import {handlers} from '@/auth/config';
import {withRequestLimit} from '@/security/request-limit';
export const runtime='nodejs';
export const GET=withRequestLimit('auth',handlers.GET);
export const POST=withRequestLimit('auth',handlers.POST);
