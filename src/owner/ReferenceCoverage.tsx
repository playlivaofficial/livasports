import type {readReferenceCoverage} from '@/odds/reference-coverage';
export function ReferenceCoverage({value}:{value:Awaited<ReturnType<typeof readReferenceCoverage>>|null}){
 if(!value)return <section className="owner-health"><h2>Reference coverage</h2><p>Audit unavailable. No provider call was made.</p></section>;
 return <section className="owner-health"><h2>Real / reference coverage · next 7 days</h2>
 <p>{value.policy.status} · {value.policy.confirmedAt}. {value.policy.evidence} Zero fallback provider requests. Rights kill switch: reference-policy.ts.</p>
 <p>Fixture counts are mutually exclusive (REAL first). Expired/suspended diagnostics may overlap. Selection counts cover 1/X/2, O/U 2.5 and BTTS.</p>
 <div style={{overflowX:'auto'}}><table><thead><tr>{['GEO','REAL fixtures','REFERENCE only','UNAVAILABLE','Expired','Suspended','Selections REAL / REF / unavailable'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{value.geos.map(g=><tr key={g.geo}><th>{g.geo}</th><td>{g.real}</td><td>{g.reference}</td><td>{g.unavailable}</td><td>{g.expired}</td><td>{g.suspended}</td><td>{g.selections.REAL} / {g.selections.REFERENCE} / {g.selections.UNAVAILABLE}</td></tr>)}</tbody></table></div>
 <h3>Saved provider diagnostics · last 24h</h3><p>Source-level classifications, not inferred from an empty UI. Existing competition health below retains per-GEO noncoverage and mapping detail.</p>
 <ul>{value.diagnostics.map(d=><li key={`${d.geo}:${d.classification}`}>{String(d.geo)} · {String(d.classification)}: {String(d.fixtures)}</li>)}</ul></section>;
}
