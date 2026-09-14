'use client';
import Link from 'next/link';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="page-container"><h1>Unable to load this page</h1><p>The sports information is temporarily unavailable.</p><button className="match-share" onClick={reset}>Try again</button><Link href="/en">Back to home</Link></main>;}
