import {withSpanishLocales} from './spanish';
import type {InterfaceLocale} from './interface';

export const favoritesRoutes={
  br:{myMatches:'/br/meus-jogos'},
  mx:{myMatches:'/mx/mis-partidos'},
  co:{myMatches:'/co/mis-partidos'},
  pe:{myMatches:'/pe/mis-partidos'},
  en:{myMatches:'/en/my-matches'},
} as const;

export type FavoritesRouteKey=keyof typeof favoritesRoutes.br;

export const favoritesCopy=withSpanishLocales({
  br:{
    nav:'Meus jogos',title:'Meus jogos',lead:'Jogos dos seus times, competições e partidas favoritas.',
    add:'Adicionar aos favoritos',remove:'Remover dos favoritos',saving:'Salvando favorito',loading:'Carregando seus jogos',error:'Não foi possível atualizar. Tente de novo.',
    all:'Todos',live:'Ao vivo',upcoming:'Próximos',results:'Resultados',
    emptyTitle:'Nenhum favorito ainda',empty:'Favorite um time, uma competição ou uma partida para montar sua agenda.',emptyCta:'Ver futebol',
    signInSync:'Entre para sincronizar favoritos entre dispositivos.',
    reasonTeam:'Time favorito',reasonCompetition:'Competição favorita',reasonMatch:'Partida favorita',
    accountTitle:'Favoritos',accountTeams:'Times',accountCompetitions:'Competições',accountMatches:'Partidas',
    accountLink:'Abrir meus jogos',header:'Meus jogos',
  },
  mx:{
    nav:'Mis partidos',title:'Mis partidos',lead:'Partidos de tus equipos, competiciones y encuentros favoritos.',
    add:'Añadir a favoritos',remove:'Quitar de favoritos',saving:'Guardando favorito',loading:'Cargando tus partidos',error:'No se pudo actualizar. Inténtalo de nuevo.',
    all:'Todos',live:'En vivo',upcoming:'Próximos',results:'Resultados',
    emptyTitle:'Aún no hay favoritos',empty:'Marca un equipo, una competición o un partido para armar tu agenda.',emptyCta:'Ver fútbol',
    signInSync:'Inicia sesión para sincronizar favoritos entre dispositivos.',
    reasonTeam:'Equipo favorito',reasonCompetition:'Competición favorita',reasonMatch:'Partido favorito',
    accountTitle:'Favoritos',accountTeams:'Equipos',accountCompetitions:'Competiciones',accountMatches:'Partidos',
    accountLink:'Abrir mis partidos',header:'Mis partidos',
  },
  en:{
    nav:'My Matches',title:'My Matches',lead:'Matches from your favorite teams, competitions and fixtures.',
    add:'Add to favorites',remove:'Remove from favorites',saving:'Saving favorite',loading:'Loading your matches',error:'Could not update. Try again.',
    all:'All',live:'Live',upcoming:'Upcoming',results:'Results',
    emptyTitle:'No favorites yet',empty:'Favorite a team, competition or match to build your personal schedule.',emptyCta:'Browse football',
    signInSync:'Sign in to sync favorites across devices.',
    reasonTeam:'Favorite team',reasonCompetition:'Favorite competition',reasonMatch:'Favorite match',
    accountTitle:'Favorites',accountTeams:'Teams',accountCompetitions:'Competitions',accountMatches:'Matches',
    accountLink:'Open My Matches',header:'My Matches',
  },
} as const);

export function favoritesPath(locale:InterfaceLocale,key:FavoritesRouteKey='myMatches'):string {
  return favoritesRoutes[locale][key];
}
