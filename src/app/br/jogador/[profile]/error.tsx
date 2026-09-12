'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="route-state"><h1>Dados temporariamente indisponíveis</h1><p>O jogador existe, mas não foi possível carregar o perfil agora.</p><button onClick={reset}>Tentar novamente</button></main>}
