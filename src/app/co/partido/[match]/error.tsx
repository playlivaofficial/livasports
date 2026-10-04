'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="route-state"><h1>Datos temporalmente no disponibles</h1><p>El partido existe, pero no fue posible cargar los datos ahora.</p><button onClick={reset}>Intentar de nuevo</button></main>}
