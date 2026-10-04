import NextLink from 'next/link';
import type {AnchorHTMLAttributes} from 'react';

type Props=AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean};

/** Query-driven football pages need a complete metadata response in Next 16.3.
 * Full document navigation preserves their canonical/season context; persisted
 * language, time preferences and guest state remain independent of the document.
 */
export default function SportsLink({href,prefetch,...props}:Props){
  if(/^\/(?:br\/futebol|(?:mx|co|pe)\/futbol|en\/football)(?:[?#]|$)/.test(href)){
    return <a {...props} href={href}/>;
  }
  return <NextLink {...props} href={href} prefetch={prefetch}/>;
}
