import { FixtureStatus, MarketCode, OutcomeCode } from '@/domain/enums';

export type SiteLocale = 'br' | 'mx' | 'co' | 'pe';
export function isSiteLocale(value:unknown):value is SiteLocale{return value==='br'||value==='mx'||value==='co'||value==='pe';}
export type PageKey = 'home' | 'football' | 'live' | 'today';

export interface LocaleDictionary {
  locale: 'pt-BR' | 'es-MX' | 'es-CO' | 'es-PE'; countryCode: 'BR' | 'MX' | 'CO' | 'PE'; countryName: string; timeZone: string;
  navigation: { home: string; football: string; live: string; today: string };
  pages: Record<PageKey, { title: string; description: string }>;
  labels: {
    currentDate: string; competitions: string; fixtures: string; odds: string; score: string; kickoff: string;
    providerFresh: string; providerStale: string; updatedAt: string; noOdds: string; partialOdds: string; staleOdds: string;
    noFixtures: string; noLiveFixtures: string; sportsUnavailable: string; oddsUnavailable: string; loading: string; loadingDescription: string;
    skipToContent: string; primaryNavigation: string; overview: string; allCompetitions: string; teams: string; status: string; matches: string;
    noFixturesDescription: string; noLiveDescription: string; competitionEmptyPeriod: string; coverageUnavailable: string; coverageUnavailableDescription: string;
  };
  statuses: Record<FixtureStatus, string>; markets: Record<MarketCode, string>; outcomes: Record<OutcomeCode, string>;
  status: { foundation: string; noFabricatedData: string; providerBoundary: string; nextMilestone: string; routeFoundation: string };
}

const baseDictionaries: Record<'br'|'mx', LocaleDictionary> = {
  br: {
    locale: 'pt-BR', countryCode: 'BR', countryName: 'Brasil', timeZone: 'America/Sao_Paulo',
    navigation: { home: 'Início', football: 'Futebol', live: 'Ao vivo', today: 'Jogos de hoje' },
    pages: {
      home: { title: 'Futebol: próximos 7 dias', description: 'Jogos dos próximos 7 dias, placares, odds e contexto das partidas no Brasil.' },
      football: { title: 'Partidas de futebol', description: 'Calendário organizado por competição, em um só lugar.' },
      live: { title: 'Futebol ao vivo', description: 'Partidas em andamento e placares atualizados.' },
      today: { title: 'Jogos de hoje', description: 'Agenda do dia no horário de Brasília.' },
    },
    labels: {
      currentDate: 'Data local', competitions: 'Competições', fixtures: 'Partidas', odds: 'Odds pré-jogo', score: 'Placar', kickoff: 'Início',
      providerFresh: 'Dados atualizados', providerStale: 'Últimos dados disponíveis', updatedAt: 'Atualizado',
      noOdds: 'Indisponível', partialOdds: 'Cobertura parcial entre as casas.',
      staleOdds: 'Odds desatualizadas foram ocultadas.', noFixtures: 'Nenhuma partida encontrada para este período.',
      noLiveFixtures: 'Nenhuma partida está ao vivo agora.', sportsUnavailable: 'Os dados esportivos estão temporariamente indisponíveis.',
      oddsUnavailable: 'As partidas estão disponíveis, mas as odds não puderam ser carregadas.', loading: 'Carregando partidas',
      loadingDescription: 'Buscando dados esportivos atualizados com segurança.',
      skipToContent: 'Ir para as partidas', primaryNavigation: 'Navegação principal', overview: 'Visão geral', allCompetitions: 'Todas', teams: 'Times', status: 'Status', matches: 'jogos',
      noFixturesDescription: 'A programação será exibida aqui assim que houver partidas neste período.',
      noLiveDescription: 'Volte em breve. Partidas ao vivo aparecem automaticamente quando começam.',
      competitionEmptyPeriod: 'Nenhum jogo disponível neste período.',
      coverageUnavailable: 'Cobertura ainda não disponível',
      coverageUnavailableDescription: 'Estamos preparando a cobertura de futebol do México. Nenhuma partida será exibida sem confirmação.',
    },
    statuses: {
      [FixtureStatus.SCHEDULED]: 'Agendado', [FixtureStatus.LIVE]: 'Ao vivo', [FixtureStatus.HALFTIME]: 'Intervalo',
      [FixtureStatus.FINISHED]: 'Encerrado', [FixtureStatus.POSTPONED]: 'Adiado', [FixtureStatus.CANCELLED]: 'Cancelado',
      [FixtureStatus.ABANDONED]: 'Interrompido',
    },
    markets: { [MarketCode.MATCH_WINNER]: 'Resultado da partida', [MarketCode.TOTAL_GOALS]: 'Total de gols', [MarketCode.BTTS]: 'Ambas marcam' },
    outcomes: {
      [OutcomeCode.HOME]: 'Casa', [OutcomeCode.DRAW]: 'Empate', [OutcomeCode.AWAY]: 'Fora',
      [OutcomeCode.OVER]: 'Mais de', [OutcomeCode.UNDER]: 'Menos de', [OutcomeCode.YES]: 'Sim', [OutcomeCode.NO]: 'Não',
    },
    status: {
      foundation: 'Fundação M1 preservada', noFabricatedData: 'Nenhum dado esportivo é simulado.',
      providerBoundary: 'Sportmonks e OddsPapi permanecem isolados por contratos internos.',
      nextMilestone: 'Entrega M2 em andamento.', routeFoundation: 'As rotas preservam a base localizada do M1.',
    },
  },
  mx: {
    locale: 'es-MX', countryCode: 'MX', countryName: 'México', timeZone: 'America/Mexico_City',
    navigation: { home: 'Inicio', football: 'Fútbol', live: 'En vivo', today: 'Partidos de hoy' },
    pages: {
      home: { title: 'Fútbol: próximos 7 días', description: 'Partidos de los próximos 7 días, marcadores, cuotas y contexto en México.' },
      football: { title: 'Partidos de fútbol', description: 'Calendario organizado por torneo, en un solo lugar.' },
      live: { title: 'Fútbol en vivo', description: 'Partidos en curso y marcadores actualizados.' },
      today: { title: 'Partidos de hoy', description: 'Calendario del día en horario de Ciudad de México.' },
    },
    labels: {
      currentDate: 'Fecha local', competitions: 'Competiciones', fixtures: 'Partidos', odds: 'Cuotas prepartido', score: 'Marcador', kickoff: 'Inicio',
      providerFresh: 'Datos actualizados', providerStale: 'Últimos datos disponibles', updatedAt: 'Actualizado',
      noOdds: 'No disponible', partialOdds: 'Cobertura parcial entre las casas.',
      staleOdds: 'Las cuotas desactualizadas se ocultaron.', noFixtures: 'No hay partidos para este periodo.',
      noLiveFixtures: 'No hay partidos en vivo en este momento.', sportsUnavailable: 'Los datos deportivos no están disponibles temporalmente.',
      oddsUnavailable: 'Los partidos están disponibles, pero no fue posible cargar las cuotas.', loading: 'Cargando partidos',
      loadingDescription: 'Consultando datos deportivos actualizados de forma segura.',
      skipToContent: 'Ir a los partidos', primaryNavigation: 'Navegación principal', overview: 'Resumen', allCompetitions: 'Todas', teams: 'Equipos', status: 'Estado', matches: 'partidos',
      noFixturesDescription: 'El calendario aparecerá aquí en cuanto haya partidos para este periodo.',
      noLiveDescription: 'Vuelve pronto. Los partidos aparecen automáticamente cuando comienzan.',
      competitionEmptyPeriod: 'No hay partidos disponibles en este período.',
      coverageUnavailable: 'Cobertura aún no disponible',
      coverageUnavailableDescription: 'Estamos preparando la cobertura del fútbol mexicano. No mostraremos partidos sin confirmar.',
    },
    statuses: {
      [FixtureStatus.SCHEDULED]: 'Programado', [FixtureStatus.LIVE]: 'En vivo', [FixtureStatus.HALFTIME]: 'Medio tiempo',
      [FixtureStatus.FINISHED]: 'Finalizado', [FixtureStatus.POSTPONED]: 'Pospuesto', [FixtureStatus.CANCELLED]: 'Cancelado',
      [FixtureStatus.ABANDONED]: 'Interrumpido',
    },
    markets: { [MarketCode.MATCH_WINNER]: 'Resultado del partido', [MarketCode.TOTAL_GOALS]: 'Total de goles', [MarketCode.BTTS]: 'Ambos anotan' },
    outcomes: {
      [OutcomeCode.HOME]: 'Local', [OutcomeCode.DRAW]: 'Empate', [OutcomeCode.AWAY]: 'Visitante',
      [OutcomeCode.OVER]: 'Más de', [OutcomeCode.UNDER]: 'Menos de', [OutcomeCode.YES]: 'Sí', [OutcomeCode.NO]: 'No',
    },
    status: {
      foundation: 'Base M1 conservada', noFabricatedData: 'No se simulan datos deportivos.',
      providerBoundary: 'Sportmonks y OddsPapi permanecen aislados mediante contratos internos.',
      nextMilestone: 'Entrega M2 en curso.', routeFoundation: 'Las rutas conservan la base localizada de M1.',
    },
  },
};

const spanish=baseDictionaries.mx;
const dictionaries:Record<SiteLocale,LocaleDictionary>={...baseDictionaries,
  co:{...spanish,locale:'es-CO',countryCode:'CO',countryName:'Colombia',timeZone:'America/Bogota',labels:{...spanish.labels,coverageUnavailableDescription:'La cobertura de esta competición aún no está disponible. No mostramos partidos sin confirmar.'},pages:{...spanish.pages,
    home:{title:'Fútbol: próximos 7 días en Colombia',description:'Partidos, resultados y cuotas con prioridad para el fútbol colombiano y los grandes torneos internacionales.'},
    today:{title:'Partidos de hoy en Colombia',description:'Consulta los partidos de hoy en horario de Colombia.'}}},
  pe:{...spanish,locale:'es-PE',countryCode:'PE',countryName:'Perú',timeZone:'America/Lima',labels:{...spanish.labels,coverageUnavailableDescription:'La cobertura de esta competición aún no está disponible. No mostramos partidos sin confirmar.'},pages:{...spanish.pages,
    home:{title:'Fútbol: próximos 7 días en Perú',description:'Partidos, resultados y cuotas con prioridad para el fútbol peruano y los grandes torneos internacionales.'},
    today:{title:'Partidos de hoy en Perú',description:'Consulta los partidos de hoy en horario de Perú.'}}},
};
export function getDictionary(locale: SiteLocale): LocaleDictionary { return dictionaries[locale]; }
export const localeRoutes = {
  br: { home: '/br', football: '/br/futebol', live: '/br/ao-vivo', today: '/br/jogos/hoje' },
  mx: { home: '/mx', football: '/mx/futbol', live: '/mx/en-vivo', today: '/mx/partidos/hoy' },
  co: { home: '/co', football: '/co/futbol', live: '/co/en-vivo', today: '/co/partidos/hoy' },
  pe: { home: '/pe', football: '/pe/futbol', live: '/pe/en-vivo', today: '/pe/partidos/hoy' },
} as const;
