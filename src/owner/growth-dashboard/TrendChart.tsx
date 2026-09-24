/**
 * Compact daily trend: current period (solid) against the previous equivalent period (dashed), one
 * measure per chart and one y-axis. Every point carries a native tooltip; the legend is always shown.
 */
export function TrendChart({title,points,valueKey,previousKey,unit}:{title:string;points:Array<Record<string,number|string>>;valueKey:string;previousKey:string;unit:string}){
  const width=640,height=160,pad={l:36,r:12,t:14,b:24};
  const values=points.flatMap(point=>[Number(point[valueKey]??0),Number(point[previousKey]??0)]),max=Math.max(1,...values);
  const x=(index:number)=>pad.l+(points.length<=1?0:index*(width-pad.l-pad.r)/(points.length-1)),y=(value:number)=>pad.t+(height-pad.t-pad.b)*(1-value/max);
  const line=(key:string)=>points.map((point,index)=>`${index?'L':'M'}${x(index).toFixed(1)} ${y(Number(point[key]??0)).toFixed(1)}`).join(' ');
  const total=(key:string)=>points.reduce((sum,point)=>sum+Number(point[key]??0),0);
  return <figure className="growth-trend">
    <figcaption><strong>{title}</strong><span className="growth-legend"><i className="growth-swatch growth-swatch-current"/>This period · {total(valueKey)} {unit}</span>
      <span className="growth-legend"><i className="growth-swatch growth-swatch-previous"/>Previous period · {total(previousKey)} {unit}</span></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${total(valueKey)} ${unit} this period, ${total(previousKey)} previous`}>
      {[0,.5,1].map(step=><g key={step}><line x1={pad.l} x2={width-pad.r} y1={y(max*step)} y2={y(max*step)} className="growth-grid"/><text x={pad.l-6} y={y(max*step)+4} textAnchor="end" className="growth-axis">{Math.round(max*step)}</text></g>)}
      <path d={line(previousKey)} className="growth-line-previous"/><path d={line(valueKey)} className="growth-line-current"/>
      {points.map((point,index)=><g key={String(point.day)}>
        <circle cx={x(index)} cy={y(Number(point[valueKey]??0))} r={points.length>40?2:4} className="growth-dot"><title>{`${point.day}: ${point[valueKey]} ${unit} (previous period: ${point[previousKey]})`}</title></circle>
        <rect x={x(index)-6} y={pad.t} width={12} height={height-pad.t-pad.b} fill="transparent"><title>{`${point.day}: ${point[valueKey]} ${unit} (previous period: ${point[previousKey]})`}</title></rect></g>)}
      {points.length?<><text x={pad.l} y={height-6} className="growth-axis">{String(points[0]!.day)}</text><text x={width-pad.r} y={height-6} textAnchor="end" className="growth-axis">{String(points.at(-1)!.day)}</text></>:null}
    </svg></figure>;
}
