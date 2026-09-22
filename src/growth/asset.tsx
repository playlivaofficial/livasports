/* eslint-disable @next/next/no-img-element */
import type {CSSProperties,ReactElement} from 'react';
import {formatBrazilKickoff} from './content';
import type {GrowthContentItem} from './types';

export const socialAssetSize={width:1080,height:1920} as const;
const colors={ink:'#f7fbff',muted:'#b9cbd8',lime:'#d5ff48',navy:'#07131c',panel:'#102634',line:'#2a4959'} as const;

function teamNameSize(name:string){return name.length>24?44:name.length>17?50:name.length>11?56:64;}
function Team({name,imageUrl,align}:{name:string;imageUrl:string|null;align:'left'|'right'}){
  return <div style={{display:'flex',flexDirection:'column',alignItems:align==='left'?'flex-start':'flex-end',width:'44%',gap:24}}>
    {imageUrl?<img src={imageUrl} alt="" width={210} height={210} style={{objectFit:'contain'}}/>:
      <div style={{width:210,height:210,borderRadius:105,display:'flex',alignItems:'center',justifyContent:'center',background:colors.panel,border:`3px solid ${colors.line}`,fontSize:72,fontWeight:900}}>{name.slice(0,2).toUpperCase()}</div>}
    <div style={{display:'flex',fontSize:teamNameSize(name),lineHeight:1.04,fontWeight:900,textAlign:align==='left'?'left':'right',maxWidth:'100%',overflowWrap:'anywhere'}}>{name}</div>
  </div>;
}
/** Pure deterministic layout used by the protected 1080×1920 export route and unit tests. */
export function createSocialAssetElement(item:GrowthContentItem):ReactElement{
  const fixture=item.fixture,context=fixture.rivalry??fixture.stage;
  const table=fixture.standings;
  const contextLine=table&&(table.homePosition!==null||table.awayPosition!==null)
    ?[table.homePosition!==null?`${fixture.home.name} ${table.homePosition}º`:null,table.awayPosition!==null?`${fixture.away.name} ${table.awayPosition}º`:null].filter(Boolean).join(' · ')
    :context;
  const root:CSSProperties={width:'100%',height:'100%',display:'flex',flexDirection:'column',position:'relative',overflow:'hidden',
    color:colors.ink,background:`linear-gradient(155deg, ${colors.navy} 0%, #0b2635 55%, #143849 100%)`,fontFamily:'Arial, sans-serif',padding:'84px 72px 72px'};
  return <div style={root}>
    <div style={{position:'absolute',display:'flex',width:420,height:420,borderRadius:210,background:'#d5ff4818',right:-150,top:180}}/>
    <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`2px solid ${colors.line}`,paddingBottom:36}}>
      <div style={{display:'flex',alignItems:'center',gap:18,fontSize:38,fontWeight:900,letterSpacing:-1}}><span style={{display:'flex',width:26,height:26,borderRadius:13,background:colors.lime}}/>LivaSports</div>
      <div style={{display:'flex',fontSize:24,color:colors.muted,textTransform:'uppercase',letterSpacing:4}}>Guia da partida</div>
    </header>
    <main style={{display:'flex',flexDirection:'column',flex:1,paddingTop:82}}>
      <div style={{display:'flex',color:colors.lime,fontSize:30,fontWeight:800,textTransform:'uppercase',letterSpacing:3,marginBottom:28}}>{fixture.competition.name}</div>
      {context?<div style={{display:'flex',alignSelf:'flex-start',background:'#d5ff4822',border:`2px solid ${colors.lime}`,borderRadius:999,padding:'12px 24px',fontSize:27,fontWeight:800,marginBottom:56}}>{context}</div>:null}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:24,minHeight:500}}>
        <Team name={fixture.home.name} imageUrl={fixture.home.imageUrl} align="left"/>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',width:'12%',paddingTop:82,fontSize:40,fontWeight:800,color:colors.muted}}>×</div>
        <Team name={fixture.away.name} imageUrl={fixture.away.imageUrl} align="right"/>
      </div>
      <section style={{display:'flex',flexDirection:'column',background:'#07131cbb',border:`2px solid ${colors.line}`,borderRadius:32,padding:'40px 42px',gap:18,marginTop:36}}>
        <div style={{display:'flex',fontSize:28,color:colors.muted}}>Horário de Brasília</div>
        <div style={{display:'flex',fontSize:46,fontWeight:900,lineHeight:1.12}}>{formatBrazilKickoff(fixture.kickoff)}</div>
        {contextLine?<div style={{display:'flex',fontSize:30,color:colors.muted,lineHeight:1.25,marginTop:14}}>{contextLine}</div>:null}
      </section>
      <section style={{display:'flex',flexDirection:'column',marginTop:48,gap:16}}>
        <div style={{display:'flex',fontSize:26,color:colors.muted,textTransform:'uppercase',letterSpacing:3}}>Comparação de odds</div>
        <div style={{display:'flex',fontSize:40,fontWeight:800}}>{fixture.odds.label}</div>
        {fixture.odds.bookmakers.length?<div style={{display:'flex',fontSize:27,color:colors.muted}}>{fixture.odds.bookmakers.map(book=>book.name).join(' · ')}</div>:null}
      </section>
    </main>
    <footer style={{display:'flex',flexDirection:'column',borderTop:`2px solid ${colors.line}`,paddingTop:38,gap:14}}>
      <div style={{display:'flex',fontSize:46,fontWeight:900,color:colors.lime}}>{item.content.cta}</div>
      <div style={{display:'flex',fontSize:25,color:colors.muted}}>Dados da partida e comparação responsável de odds.</div>
    </footer>
  </div>;
}
