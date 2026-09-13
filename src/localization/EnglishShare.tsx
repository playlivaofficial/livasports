'use client';
import {useState} from 'react';
export function EnglishShare({canonicalUrl,shareText,labels}:{canonicalUrl:string;shareText:string;labels:{share:string;copied:string}}){
  const [copied,setCopied]=useState(false),[failed,setFailed]=useState(false);
  return <div className="match-actions"><button className="match-share" type="button" onClick={async()=>{
    try{if(navigator.share)await navigator.share({title:shareText,url:canonicalUrl});else{await navigator.clipboard.writeText(canonicalUrl);setCopied(true);}setFailed(false);}
    catch(error){if(!(error instanceof Error&&error.name==='AbortError'))setFailed(true);}
  }}>{copied?labels.copied:labels.share}</button><span role="status">{failed?'Sharing is unavailable. You can copy the page address.':''}</span></div>;
}
