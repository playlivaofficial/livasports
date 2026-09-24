'use client';
import {useMemo,useState} from 'react';

export interface SortableColumn {key:string;label:string;numeric?:boolean;suffix?:string;}
export type SortableRow=Record<string,string|number|null>;
/** Owner table with click-to-sort headers. Data arrives fully rendered from the server; sorting is local. */
export function SortableTable({caption,columns,rows,csvHref,empty='No data for these filters.',initialSort}:{caption:string;columns:SortableColumn[];rows:SortableRow[];csvHref?:string;empty?:string;initialSort?:string}){
  const [sort,setSort]=useState<{key:string;dir:1|-1}>({key:initialSort??columns.find(column=>column.numeric)?.key??columns[0]!.key,dir:-1});
  const sorted=useMemo(()=>[...rows].sort((a,b)=>{const x=a[sort.key],y=b[sort.key];
    if(typeof x==='number'&&typeof y==='number')return (x-y)*sort.dir;return String(x??'').localeCompare(String(y??''))*sort.dir;}),[rows,sort]);
  return <div className="growth-table">
    <div className="growth-table-bar"><h3>{caption}</h3>{csvHref?<a href={csvHref} download>CSV</a>:null}</div>
    <div className="owner-health-scroll"><table className="owner-health-table"><thead><tr>{columns.map(column=><th key={column.key} className={column.numeric?"growth-num":undefined} aria-sort={sort.key===column.key?(sort.dir===1?'ascending':'descending'):'none'}>
      <button type="button" className="growth-sort" onClick={()=>setSort(current=>({key:column.key,dir:current.key===column.key?(current.dir===1?-1:1):(column.numeric?-1:1)}))}>
        {column.label}{sort.key===column.key?(sort.dir===1?' ▲':' ▼'):''}</button></th>)}</tr></thead>
      <tbody>{sorted.map((row,index)=><tr key={`${row[columns[0]!.key]}-${index}`}>{columns.map(column=><td key={column.key} className={column.numeric?'growth-num':undefined}>
        {row[column.key]===null||row[column.key]===undefined?'—':`${row[column.key]}${column.suffix??''}`}</td>)}</tr>)}
        {!sorted.length?<tr><td colSpan={columns.length}>{empty}</td></tr>:null}</tbody></table></div></div>;
}
