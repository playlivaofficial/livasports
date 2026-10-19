import type {Metadata} from 'next';
export const siteMetadata:Metadata={
  metadataBase:new URL('https://livasports.com'),
  title:{default:'LivaSports',template:'%s | LivaSports'},
  description:'Análisis, historias, guías y herramientas para disfrutar el fútbol.',
  robots:process.env.VERCEL_ENV==='production'?{index:true,follow:true}:{index:false,follow:false},
  twitter:{card:'summary_large_image'},
};
