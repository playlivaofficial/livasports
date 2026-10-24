/** Franchise/division identity, not a standings or qualification claim.
 * Source: https://www.nba.com/news/about (reviewed 2026-10-24).
 * Names only; this does not license franchise artwork. */
export const nbaDivisions = {
  Atlantic: ['Boston Celtics','Brooklyn Nets','New York Knicks','Philadelphia 76ers','Toronto Raptors'],
  Central: ['Chicago Bulls','Cleveland Cavaliers','Detroit Pistons','Indiana Pacers','Milwaukee Bucks'],
  Southeast: ['Atlanta Hawks','Charlotte Hornets','Miami Heat','Orlando Magic','Washington Wizards'],
  Northwest: ['Denver Nuggets','Minnesota Timberwolves','Oklahoma City Thunder','Portland Trail Blazers','Utah Jazz'],
  Pacific: ['Golden State Warriors','Los Angeles Clippers','Los Angeles Lakers','Phoenix Suns','Sacramento Kings'],
  Southwest: ['Dallas Mavericks','Houston Rockets','Memphis Grizzlies','New Orleans Pelicans','San Antonio Spurs'],
} as const;
export function nbaDivision(name:string){return Object.entries(nbaDivisions).find(([,names])=>(names as readonly string[]).includes(name))?.[0];}
export function nbaConference(division:string){return ['Atlantic','Central','Southeast'].includes(division)?'Eastern':['Northwest','Pacific','Southwest'].includes(division)?'Western':undefined;}
