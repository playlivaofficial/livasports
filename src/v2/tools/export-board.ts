import type {BoardState} from './model';

/** Local-only canvas export: no screenshot service, uploads or external assets. */
export async function exportBoard(board:BoardState,fallbackTitle:string){
  const canvas=document.createElement('canvas');canvas.width=1000;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('canvas_unavailable');
  ctx.font='20px system-ui';
  const lines:string[]=[];let line='';
  // Preserve every annotation character, including long words and explicit newlines.
  for(const char of board.notes){if(char==='\n'){lines.push(line);line='';continue;}if(ctx.measureText(line+char).width>890){lines.push(line);line='';}line+=char;}if(line)lines.push(line);
  canvas.height=Math.max(1500,1430+lines.length*28);
  ctx.fillStyle='#0c2020';ctx.fillRect(0,0,1000,canvas.height);ctx.fillStyle='#f8fafc';ctx.font='700 40px system-ui';ctx.fillText(board.title||fallbackTitle,50,70,900);ctx.font='22px system-ui';ctx.fillStyle='#74e5ac';ctx.fillText(`LIVASPORTS  /  ${board.formation}`,50,110);
  const top=150,height=1200,left=40,width=920;
  ctx.fillStyle='#127950';ctx.fillRect(left,top,width,height);for(let n=0;n<10;n++){if(n%2===0){ctx.fillStyle='#168457';ctx.fillRect(left,top+n*height/10,width,height/10);}}
  ctx.strokeStyle='#b5e4c9';ctx.lineWidth=3;ctx.strokeRect(65,175,870,1150);ctx.beginPath();ctx.moveTo(65,750);ctx.lineTo(935,750);ctx.stroke();ctx.beginPath();ctx.arc(500,750,115,0,Math.PI*2);ctx.stroke();ctx.strokeRect(285,175,430,180);ctx.strokeRect(285,1145,430,180);ctx.strokeRect(395,175,210,75);ctx.strokeRect(395,1250,210,75);
  for(const arrow of board.arrows){const from=[left+arrow.from[0]*width/100,top+arrow.from[1]*height/100],to=[left+arrow.to[0]*width/100,top+arrow.to[1]*height/100],angle=Math.atan2(to[1]-from[1],to[0]-from[0]);ctx.strokeStyle='#ffe187';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(from[0],from[1]);ctx.lineTo(to[0],to[1]);ctx.lineTo(to[0]-22*Math.cos(angle-.5),to[1]-22*Math.sin(angle-.5));ctx.moveTo(to[0],to[1]);ctx.lineTo(to[0]-22*Math.cos(angle+.5),to[1]-22*Math.sin(angle+.5));ctx.stroke();}
  for(const player of board.players.filter(p=>p.team===0||board.opposition)){const x=left+player.x*width/100,y=top+player.y*height/100;ctx.fillStyle=player.team?'#f5b759':'#e8fff2';ctx.beginPath();ctx.arc(x,y,27,0,Math.PI*2);ctx.fill();ctx.fillStyle='#11352a';ctx.textAlign='center';ctx.font='700 22px system-ui';ctx.fillText(String((player.id-1)%11+1),x,y+8);ctx.font='600 20px system-ui';ctx.fillStyle='#fff';ctx.fillText(player.name,x,y+52,150);}
  ctx.textAlign='left';ctx.fillStyle='#d3e5dd';ctx.font='20px system-ui';
  lines.forEach((text,index)=>ctx.fillText(text,50,1395+index*28));
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('canvas_export_failed')),'image/png'));
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='livasports-football-board.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
