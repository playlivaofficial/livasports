import Link from 'next/link';
export default function NotFound(){return <main className="route-state"><h1>Partido no encontrado</h1><p>Esta dirección no corresponde a un partido registrado.</p><Link href="/mx/futbol">Volver a los partidos</Link></main>}
