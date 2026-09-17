// In-page geometry probe shared by scripts/hotfix-mobile-layout-qa.mjs and manual browser checks.
// Returns collisions between fixture favorite buttons and bookmaker labels/odds/team text, label↔group
// attachment, header star contrast, horizontal overflow and creative scaling. Pure DOM reads, no clicks.
export const layoutProbe=`(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
  const inter=(a,b)=>a.w>0&&b.w>0&&a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
  const lum=c=>{const m=c.match(/[\\d.]+/g)||[0,0,0];const [r,g,b]=m.slice(0,3).map(v=>{v=Number(v)/255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});return .2126*r+.7152*g+.0722*b;};
  const contrast=(a,b)=>{const l1=lum(a),l2=lum(b);return Math.round(((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05))*100)/100;};
  const header=document.querySelector('.app-header'),link=document.querySelector('.my-matches-header-link'),glyph=link&&link.querySelector('span[aria-hidden]'),text=link&&link.querySelector('.my-matches-header-text');
  const headerBg=header?getComputedStyle(header).backgroundColor:null;
  const rows=[...document.querySelectorAll('.fixture-row')];
  const collisions=[],labels=[];let starsChecked=0;
  for(const row of rows){
    const star=row.querySelector('.favorite-toggle-row');if(!star)continue;starsChecked++;const s=rect(star);
    const targets=[...row.querySelectorAll('.listing-odds-book-name,.listing-odds-cell,.team-name,.kickoff-time,.status-badge,.score-value,.odds-empty')];
    for(const t of targets)if(inter(s,rect(t)))collisions.push({row:[...row.querySelectorAll('.team-name')].map(n=>n.textContent.trim()).join(' / '),star:s,target:t.className.split(' ')[0],text:t.textContent.trim().slice(0,14),box:rect(t)});
    const next=row.nextElementSibling;if(next&&next.classList.contains('fixture-row')&&inter(s,rect(next)))collisions.push({row:'next-row',star:s,target:'fixture-row'});
    for(const book of row.querySelectorAll('.listing-odds-book')){const name=book.querySelector('.listing-odds-book-name'),grid=book.querySelector('.listing-odds');if(!name||!grid)continue;const n=rect(name),g=rect(grid),b=rect(book);
      labels.push({label:name.textContent.trim(),attached:n.x>=b.x-1&&n.x+n.w<=b.x+b.w+1&&n.y+n.h<=g.y+1&&Math.abs(n.x-g.x)<=4,cells:grid.querySelectorAll('.listing-odds-cell').length,cellWidths:[...grid.querySelectorAll('.listing-odds-cell')].map(c=>rect(c).w)});}
  }
  const creative=document.querySelector('.sponsor-embed-box iframe, .commercial-sponsor img');
  const box=document.querySelector('.sponsor-embed-box')||creative;
  const creativeInfo=creative?(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(creative).transform);const r=rect(creative),bx=rect(box);return {tag:creative.tagName,scale:Math.round(m.a*1000)/1000,attrWidth:Number(creative.getAttribute('width')),attrHeight:Number(creative.getAttribute('height')),rendered:{w:Math.round(r.w*m.a),h:Math.round(r.h*m.d)},box:bx,slot:rect(creative.closest('.commercial-sponsor')),naturalWidth:creative.naturalWidth||null,currentSrc:creative.currentSrc?new URL(creative.currentSrc).pathname.slice(0,40):null,dpr:devicePixelRatio,upscaled:m.a>1.001};})():null;
  return {url:location.pathname+location.search,theme:document.documentElement.dataset.theme,width:innerWidth,dpr:devicePixelRatio,
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    header:link?{linkColor:getComputedStyle(link).color,glyphColor:glyph?getComputedStyle(glyph).color:null,textColor:text?getComputedStyle(text).color:null,bg:headerBg,glyphContrast:glyph?contrast(getComputedStyle(glyph).color,headerBg):null,textContrast:text?contrast(getComputedStyle(text).color,headerBg):null,box:rect(link),glyphVisible:glyph?rect(glyph).w>0:false}:null,
    rows:rows.length,starsChecked,collisions,labels:{total:labels.length,detached:labels.filter(l=>!l.attached),threeCells:labels.every(l=>l.cells===3),minCellWidth:Math.min(...labels.flatMap(l=>l.cellWidths),9999)},
    creative:creativeInfo,slipBar:(()=>{const t=document.querySelector('.slip-trigger');if(!t)return null;const r=rect(t);const last=rows[rows.length-1];const lr=last?rect(last):null;return {bar:r,lastRowBottomAboveBar:lr?lr.y+lr.h<=r.y||document.documentElement.scrollHeight-innerHeight>=lr.y+lr.h-innerHeight+r.h:null};})()};
})()`;
