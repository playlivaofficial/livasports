import Link from 'next/link';
export default function NotFound(){return <main className="route-state"><h1>Partida não encontrada</h1><p>Este endereço não corresponde a uma partida cadastrada.</p><Link href="/br/futebol">Voltar aos jogos</Link></main>}
