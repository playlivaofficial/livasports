export type SiteLocale = 'br' | 'mx';

export interface LocaleDictionary {
  locale: 'pt-BR' | 'es-MX';
  countryName: string;
  navigation: { home: string; football: string; live: string; today: string };
  pages: {
    home: { title: string; description: string };
    football: { title: string; description: string };
    live: { title: string; description: string };
    today: { title: string; description: string };
  };
  status: {
    foundation: string;
    noFabricatedData: string;
    providerBoundary: string;
    nextMilestone: string;
    routeFoundation: string;
  };
}

const dictionaries: Record<SiteLocale, LocaleDictionary> = {
  br: {
    locale: 'pt-BR', countryName: 'Brasil',
    navigation: { home: 'Início', football: 'Futebol', live: 'Ao vivo', today: 'Jogos de hoje' },
    pages: {
      home: { title: 'LivaSports Brasil', description: 'Base técnica para placares, jogos e comparação de odds.' },
      football: { title: 'Futebol', description: 'As competições e partidas reais serão conectadas na próxima etapa.' },
      live: { title: 'Ao vivo', description: 'Esta rota está pronta para receber placares e eventos normalizados.' },
      today: { title: 'Jogos de hoje', description: 'Esta rota está pronta para receber a agenda diária de futebol.' },
    },
    status: {
      foundation: 'Fundação M1 ativa',
      noFabricatedData: 'Nenhum dado esportivo é simulado.',
      providerBoundary: 'Sportmonks e OddsPapi ficam isolados por contratos internos da LivaSports.',
      nextMilestone: 'Dados reais entram no M2.',
      routeFoundation: 'As rotas existem para validar localização e composição sem antecipar a interface do produto.',
    },
  },
  mx: {
    locale: 'es-MX', countryName: 'México',
    navigation: { home: 'Inicio', football: 'Fútbol', live: 'En vivo', today: 'Partidos de hoy' },
    pages: {
      home: { title: 'LivaSports México', description: 'Base técnica para marcadores, partidos y comparación de cuotas.' },
      football: { title: 'Fútbol', description: 'Las competiciones y partidos reales se conectarán en la siguiente etapa.' },
      live: { title: 'En vivo', description: 'Esta ruta está lista para recibir marcadores y eventos normalizados.' },
      today: { title: 'Partidos de hoy', description: 'Esta ruta está lista para recibir el calendario diario de fútbol.' },
    },
    status: {
      foundation: 'Base M1 activa',
      noFabricatedData: 'No se simulan datos deportivos.',
      providerBoundary: 'Sportmonks y OddsPapi están aislados mediante contratos internos de LivaSports.',
      nextMilestone: 'Los datos reales llegan en M2.',
      routeFoundation: 'Las rutas validan la localización y la composición sin anticipar la interfaz del producto.',
    },
  },
};

export function getDictionary(locale: SiteLocale): LocaleDictionary { return dictionaries[locale]; }

export const localeRoutes = {
  br: { home: '/br', football: '/br/futebol', live: '/br/ao-vivo', today: '/br/jogos/hoje' },
  mx: { home: '/mx', football: '/mx/futbol', live: '/mx/en-vivo', today: '/mx/partidos/hoy' },
} as const;
