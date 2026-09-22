import {CHANNEL_UTM,GROWTH_CHANNELS,UTM_CAMPAIGN,type GrowthChannel} from './config';

/**
 * Canonical identity never includes tracking parameters. This helper creates an attributed copy while
 * keeping the same origin/path and using the existing analytics client's first-touch UTM ingestion.
 */
export function trackedGrowthUrl(canonicalUrl:string,channel:GrowthChannel,publicId:string):string{
  if(!GROWTH_CHANNELS.includes(channel))throw new Error('UNKNOWN_GROWTH_CHANNEL');
  const url=new URL(canonicalUrl);
  const config=CHANNEL_UTM[channel];
  url.searchParams.set('utm_source',config.source);
  url.searchParams.set('utm_medium',config.medium);
  url.searchParams.set('utm_campaign',UTM_CAMPAIGN);
  url.searchParams.set('utm_content',`match_${publicId}`);
  return url.toString();
}
export function growthTrackingUrls(canonicalUrl:string,publicId:string):Record<GrowthChannel,string>{
  return Object.fromEntries(GROWTH_CHANNELS.map(channel=>[channel,trackedGrowthUrl(canonicalUrl,channel,publicId)])) as Record<GrowthChannel,string>;
}
