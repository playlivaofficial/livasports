'use client';
import {usePathname} from 'next/navigation';
import {languageNames,publicLanguages,publicLanguageNames,publicLanguage,type InterfaceLocale} from './interface';

export function LanguageSelector({locale}:{locale:InterfaceLocale}){
  const pathname=usePathname();
  const label=locale==='en'?'Language':'Idioma';
  return <details className="language-picker" onKeyDown={event=>{
    if(event.key==='Escape'&&event.currentTarget.open){event.preventDefault();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}
  }}><summary aria-label={`${label}: ${languageNames[locale]}`}>
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" stroke="currentColor" strokeWidth="1.5"/></svg>
    <span>{languageNames[locale]}</span><span aria-hidden="true">⌄</span></summary>
    <form action="/language" method="post" aria-label={label} onSubmit={event=>{
      const input=event.currentTarget.elements.namedItem('returnTo') as HTMLInputElement;
      input.value=window.location.pathname+window.location.search+window.location.hash;
    }}><input type="hidden" name="returnTo" value={pathname}/>
      {publicLanguages.map(value=><button key={value} name="locale" value={value} type="submit" lang={value} aria-current={value===publicLanguage(locale)?'true':undefined}>
        {publicLanguageNames[value]}<span aria-hidden="true">{value===publicLanguage(locale)?'✓':''}</span></button>)}
    </form></details>;
}
