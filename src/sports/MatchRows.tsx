import {requestTimeZone} from '@/localization/time-zone-server';
import {MatchRowsView,type MatchRowsProps} from './MatchRowsView';

export async function MatchRows({timeZone,...props}:MatchRowsProps&{timeZone?:string}){
  return <MatchRowsView {...props} timeZone={timeZone??await requestTimeZone(props.locale)}/>;
}
