'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="route-state"><h1>Dados temporariamente indisponíveis</h1><p>A partida existe, mas não foi possível carregar os dados agora.</p><button onClick={reset}>Tentar novamente</button></main>}
