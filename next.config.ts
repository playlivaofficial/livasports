import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['ffmpeg-static'],
  outputFileTracingIncludes: {
    '/api/internal/growth-refresh': ['./public/growth/characters/approved-v1/*.png','./public/growth/scenery/v1/*.png','./public/growth/fonts/*'],
    '/api/owner/growth': ['./public/growth/characters/approved-v1/*.png','./public/growth/scenery/v1/*.png','./public/growth/fonts/*'],
  },
  async headers(){
    const production=process.env.NODE_ENV==='production';
    const policy=["default-src 'self'",`script-src 'self' 'unsafe-inline'${production?'':" 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'","img-src 'self' https: data: blob:","font-src 'self' data:",
      `connect-src 'self'${production?'':' ws: wss:'}`,"frame-src 'self'","object-src 'none'","base-uri 'self'",
      "form-action 'self' https://accounts.google.com","frame-ancestors 'none'",...(production?['upgrade-insecure-requests']:[])].join('; ');
    return [
      {source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},
        {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
        {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=()'},
        ...(production?[{key:'Strict-Transport-Security',value:'max-age=63072000; includeSubDomains'}]:[])]},
      // Creative documents retain their stricter credentialless sandbox CSP and same-origin framing.
      {source:'/((?!api/commercial/creative).*)',headers:[{key:'Content-Security-Policy',value:policy},{key:'X-Frame-Options',value:'DENY'}]},
      {source:'/api/auth/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'}]},
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.sportmonks.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'flagcdn.com', port: '', pathname: '/**' },
    ],
  },
};

export default nextConfig;
