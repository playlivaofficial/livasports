import {authorityGet,authorityPost} from '@/authority/server';
import {withRequestLimit} from '@/security/request-limit';
export const runtime='nodejs';
export const GET=withRequestLimit('owner',authorityGet);
export const POST=withRequestLimit('owner',authorityPost);
