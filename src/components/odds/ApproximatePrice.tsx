export function ApproximatePrice({value,label,className,title,approximate=true}:{value:string;label:string;className?:string;title?:string;approximate?:boolean}){
  return <span className={className} title={title}>{approximate?<span className="odds-approx-mark" aria-hidden="true">≈</span>:null}<span>{value}</span><span className="sr-only">, {label}</span></span>;
}
