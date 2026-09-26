import {MOTION_VERSION,VIDEO} from './config';
import {AUDIO_LIBRARY_VERSION} from './audio-design';

/**
 * The creative stack identity.
 *
 * Duplicate prevention used to key on fixture + recency alone, so once a fixture had any generation the
 * scheduler skipped it forever: the Premium Motion renderer shipped and the owner queue kept serving the
 * assets rendered by the previous stack. Generation is now keyed on this version as well, which makes
 * "already generated" mean "already generated with the creative we ship today".
 *
 * Bump `CREATIVE_STACK_REVISION` whenever the rendered result materially changes in a way the constants
 * below do not already capture — new typography, new layout, a new character or team-identity treatment,
 * a new narration style. The next ordinary scheduler run then sees active current content as stale and
 * regenerates it exactly once; nothing has to be cleaned up by hand.
 */
export const CREATIVE_STACK_REVISION=1 as const;

/**
 * Composed so a change to any tracked part of the stack changes the identity on its own. Everything in
 * here is rendered into the video, so a difference here is a difference the owner can see.
 */
export const CREATIVE_VERSION=`cs${CREATIVE_STACK_REVISION}.${MOTION_VERSION}.${VIDEO.width}x${VIDEO.height}@${VIDEO.fps}.audio-${AUDIO_LIBRARY_VERSION}` as const;

/**
 * Everything produced before the creative version existed. Historical rows are backfilled with this and
 * are never claimed to be current: they stay readable as history and are treated as stale for generation.
 */
export const LEGACY_CREATIVE_VERSION='LEGACY_PRE_CREATIVE_VERSION' as const;

/** A stored asset/item is current only when it carries exactly today's creative version. */
export function isCurrentCreative(version:string|null|undefined):boolean{
  return version===CREATIVE_VERSION;
}
/** Stale means "exists, but was produced by an older stack", which earns exactly one regeneration. */
export function isStaleCreative(version:string|null|undefined):boolean{
  return !isCurrentCreative(version);
}
