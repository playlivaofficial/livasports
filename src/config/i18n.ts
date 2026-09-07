import { FixtureStatus, MarketCode, OutcomeCode } from '@/domain/enums';

export type SiteLocale = 'br' | 'mx';
export type PageKey = 'home' | 'football' | 'live' | 'today';

export interface LocaleDictionary {
  locale: 'pt-BR' | 'es-MX'; countryCode: 'BR' | 'MX'; countryName: string; timeZone: string;
  navigation: { home: string; football: string; live: string; today: string };
  pages: Record<PageKey, { title: string; description: string }>;
  labels: {
    currentDate: string; competitions: string; fixtures: string; odds: string; score: string; kickoff: string;
    providerFresh: string; providerStale: string; updatedAt: string; noOdds: string; partialOdds: string; staleOdds: string;
    noFixtures: string; noLiveFixtures: string; sportsUnavailable: string; oddsUnavailable: string; loading: string; loadingDescription: string;
  };
  statuses: Record<FixtureStatus, string>; markets: Record<MarketCode, string>; outcomes: Record<OutcomeCode, string>;
  status: { foundation: string; noFabricatedData: string; providerBoundary: string; nextMilestone: string; routeFoundation: string };
}

const dictionaries: Record<SiteLocale, LocaleDictionary> = {
  br: {
    locale: 'pt-BR', countryCode: 'BR', countryName: 'Brasil', timeZone: 'America/Sao_Paulo',
    navigation: { home: 'Início', football: 'Futebol', live: 'Ao vivo', today: 'Jogos de hoje' },
    pages: {
      home: { title: 'Futebol no Brasil', description: 'Jogos de hoje, placares e comparação de odds pré-jogo.' },
      football: { title: 'Jogos de futebol', description: 'Partidas organizadas por competição, com dados reais e cobertura transparente.' },
      live: { title: 'Futebol ao vivo', description: 'Somente partidas confirmadas como ao vivo pelo provedor de dados.' },
      today: { title: 'Jogos de hoje', description: 'Agenda do dia conforme o horário oficial de Brasília.' },
    },
    labels: {
      currentDate: 'Data local', competitions: 'Competições', fixtures: 'Partidas', odds: 'Odds pré-jogo', score: 'Placar', kickoff: 'Início',
      providerFresh: 'Dados atualizados', providerStale: 'Últimos dados disponíveis', updatedAt: 'Atualizado',
      noOdds: 'Sem odds válidas para Betano BR ou Betsson.', partialOdds: 'Cobertura parcial entre as casas.',
      staleOdds: 'Odds desatualizadas foram ocultadas.', noFixtures: 'Nenhuma partida encontrada para este período.',
      noLiveFixtures: 'Nenhuma partida está ao vivo agora.', sportsUnavailable: 'Os dados esportivos estão temporariamente indisponíveis.',
      oddsUnavailable: 'As partidas estão disponíveis, mas as odds não puderam ser carregadas.', loading: 'Carregando partidas',
      loadingDescription: 'Buscando dados esportivos atualizados com segurança.',
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
      home: { title: 'Fútbol en México', description: 'Partidos de hoy, marcadores y comparación de cuotas prepartido.' },
      football: { title: 'Partidos de fútbol', description: 'Partidos agrupados por torneo, con datos reales y cobertura transparente.' },
      live: { title: 'Fútbol en vivo', description: 'Solo partidos confirmados como en vivo por el proveedor de datos.' },
      today: { title: 'Partidos de hoy', description: 'Calendario del día según la hora oficial de Ciudad de México.' },
    },
    labels: {
      currentDate: 'Fecha local', competitions: 'Competiciones', fixtures: 'Partidos', odds: 'Cuotas prepartido', score: 'Marcador', kickoff: 'Inicio',
      providerFresh: 'Datos actualizados', providerStale: 'Últimos datos disponibles', updatedAt: 'Actualizado',
      noOdds: 'Sin cuotas válidas de Betano BR o Betsson.', partialOdds: 'Cobertura parcial entre las casas.',
      staleOdds: 'Las cuotas desactualizadas se ocultaron.', noFixtures: 'No hay partidos para este periodo.',
      noLiveFixtures: 'No hay partidos en vivo en este momento.', sportsUnavailable: 'Los datos deportivos no están disponibles temporalmente.',
      oddsUnavailable: 'Los partidos están disponibles, pero no fue posible cargar las cuotas.', loading: 'Cargando partidos',
      loadingDescription: 'Consultando datos deportivos actualizados de forma segura.',
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

export function getDictionary(locale: SiteLocale): LocaleDictionary { return dictionaries[locale]; }
export const localeRoutes = {
  br: { home: '/br', football: '/br/futebol', live: '/br/ao-vivo', today: '/br/jogos/hoje' },
  mx: { home: '/mx', football: '/mx/futbol', live: '/mx/en-vivo', today: '/mx/partidos/hoy' },
} as const;
