export function ApproximatePrice({value,label,className,title}:{value:string;label:string;className?:string;title?:string}){
  return <span className={className} title={title}><span className="odds-approx-mark" aria-hidden="true">≈</span><span>{value}</span><span className="sr-only">, {label}</span></span>;
}
