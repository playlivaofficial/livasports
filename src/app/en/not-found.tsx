import Link from 'next/link';
  import {SiteHeader} from '@/components/sports/SiteHeader';
  export default function NotFound(){return <div lang="en" className="app-shell"><SiteHeader locale="en" activePage="football"/><main id="fixtures-content" className="page-container"><h1>Page not found</h1><p>This sports page is unavailable.</p><Link href="/en/football">Back to football</Link></main></div>;}
