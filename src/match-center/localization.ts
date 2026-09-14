import type {SiteLocale} from '@/config/i18n';

export const eventLabels: Record<SiteLocale, Record<string, string>> = {
  br: { Corner:'Escanteio',Offside:'Impedimento','Shot Off Target':'Finalização para fora','Shot On Target':'Finalização no gol', Goal: 'Gol', Substitution: 'Substituição', Yellowcard: 'Cartão amarelo', 'Yellow Card': 'Cartão amarelo', Redcard: 'Cartão vermelho', 'Red Card': 'Cartão vermelho', Penalty: 'Pênalti', 'Own Goal': 'Gol contra', VAR: 'VAR',VAR_CARD:'Revisão de cartão pelo VAR','Yellow/Red card':'Expulsão por segundo amarelo','Missed Penalty':'Pênalti perdido','Penalty Shootout Goal':'Cobrança convertida','Penalty Shootout Miss':'Cobrança perdida' },
  mx: { Corner:'Tiro de esquina',Offside:'Fuera de juego','Shot Off Target':'Tiro desviado','Shot On Target':'Tiro a puerta', Goal: 'Gol', Substitution: 'Sustitución', Yellowcard: 'Tarjeta amarilla', 'Yellow Card': 'Tarjeta amarilla', Redcard: 'Tarjeta roja', 'Red Card': 'Tarjeta roja', Penalty: 'Penal', 'Own Goal': 'Autogol', VAR: 'VAR',VAR_CARD:'Revisión de tarjeta por el VAR','Yellow/Red card':'Expulsión por doble amarilla','Missed Penalty':'Penal fallado','Penalty Shootout Goal':'Tanda: penal convertido','Penalty Shootout Miss':'Tanda: penal fallado' },
};
export const statisticLabels: Record<SiteLocale, Record<string, string>> = {
  br: {
    Treatments:'Atendimentos em campo','Offsides Overtime':'Impedimentos na prorrogação','Substitutions Overtime':'Substituições na prorrogação',Challenges:'Disputas',Headers:'Cabeceios','Successful Interceptions':'Interceptações certas','Yellowcards Overtime':'Cartões amarelos na prorrogação',
    'Counter Attacks':'Contra-ataques',Penalties:'Pênaltis',Redcards:'Cartões vermelhos','Yellowred Cards':'Expulsões por segundo amarelo',
    'Accurate Crosses':'Cruzamentos certos',Assists:'Assistências',Attacks:'Ataques','Ball Possession %':'Posse de bola','Ball Safe':'Posse segura',
    'Big Chances Created':'Grandes chances criadas','Big Chances Missed':'Grandes chances perdidas',Corners:'Escanteios','Dangerous Attacks':'Ataques perigosos',
    'Dribble Attempts':'Tentativas de drible','Duels Won':'Duelos vencidos',Fouls:'Faltas','Free Kicks':'Tiros livres','Goal Attempts':'Tentativas de gol',
    'Goal Kicks':'Tiros de meta',Goals:'Gols','Hit Woodwork':'Bolas na trave',Injuries:'Lesões',Interceptions:'Interceptações','Key Passes':'Passes decisivos',
    'Long Passes':'Passes longos',Offsides:'Impedimentos',Passes:'Passes',Saves:'Defesas','Shots Blocked':'Finalizações bloqueadas',
    'Shots Insidebox':'Finalizações dentro da área','Shots Off Target':'Finalizações para fora','Shots On Target':'Finalizações no gol',
    'Shots Outsidebox':'Finalizações fora da área','Shots Total':'Finalizações',Substitutions:'Substituições','Successful Dribbles':'Dribles certos',
    'Successful Dribbles Percentage':'Dribles certos (%)','Successful Headers':'Cabeceios certos','Successful Long Passes':'Passes longos certos',
    'Successful Long Passes Percentage':'Passes longos certos (%)','Successful Passes':'Passes certos','Successful Passes Percentage':'Passes certos (%)',
    Tackles:'Desarmes','Tackles Won':'Desarmes vencidos',Throwins:'Laterais','Total Crosses':'Cruzamentos',Yellowcards:'Cartões amarelos',
  },
  mx: {
    Treatments:'Atenciones médicas en el campo','Offsides Overtime':'Fueras de juego en tiempo extra','Substitutions Overtime':'Sustituciones en tiempo extra',Challenges:'Disputas',Headers:'Cabezazos','Successful Interceptions':'Intercepciones exitosas','Yellowcards Overtime':'Tarjetas amarillas en tiempo extra',
    'Counter Attacks':'Contraataques',Penalties:'Penales',Redcards:'Tarjetas rojas','Yellowred Cards':'Expulsiones por doble amarilla',
    'Accurate Crosses':'Centros precisos',Assists:'Asistencias',Attacks:'Ataques','Ball Possession %':'Posesión','Ball Safe':'Posesión segura',
    'Big Chances Created':'Grandes ocasiones creadas','Big Chances Missed':'Grandes ocasiones falladas',Corners:'Tiros de esquina','Dangerous Attacks':'Ataques peligrosos',
    'Dribble Attempts':'Intentos de regate','Duels Won':'Duelos ganados',Fouls:'Faltas','Free Kicks':'Tiros libres','Goal Attempts':'Intentos de gol',
    'Goal Kicks':'Saques de meta',Goals:'Goles','Hit Woodwork':'Tiros al poste',Injuries:'Lesiones',Interceptions:'Intercepciones','Key Passes':'Pases clave',
    'Long Passes':'Pases largos',Offsides:'Fuera de juego',Passes:'Pases',Saves:'Atajadas','Shots Blocked':'Tiros bloqueados',
    'Shots Insidebox':'Tiros dentro del área','Shots Off Target':'Tiros desviados','Shots On Target':'Tiros a puerta',
    'Shots Outsidebox':'Tiros fuera del área','Shots Total':'Tiros',Substitutions:'Sustituciones','Successful Dribbles':'Regates exitosos',
    'Successful Dribbles Percentage':'Regates exitosos (%)','Successful Headers':'Cabezazos exitosos','Successful Long Passes':'Pases largos precisos',
    'Successful Long Passes Percentage':'Pases largos precisos (%)','Successful Passes':'Pases precisos','Successful Passes Percentage':'Pases precisos (%)',
    Tackles:'Entradas','Tackles Won':'Entradas ganadas',Throwins:'Saques de banda','Total Crosses':'Centros',Yellowcards:'Tarjetas amarillas',
  },
};
