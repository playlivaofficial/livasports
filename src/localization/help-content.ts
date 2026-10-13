import {withSpanishLocales} from './spanish';
import type {InterfaceLocale} from './interface';
import type {HelpKind} from './help-routes';
import {marketHelp} from './market-help';
/** P2 evergreen help. Describes implemented product behaviour only; no predictions, licences, experts or prices. */
export type HelpArticle={title:string;intro:string;sections:{title:string;body:string}[];related:HelpKind[]};
export const helpReviewedAt='2026-09-17';
export const helpReviewDate=(_locale:InterfaceLocale,kind:HelpKind)=>kind==='favorites'?helpReviewedAt:'2026-10-13';
export const helpCopy=withSpanishLocales({
  br:{eyebrow:'Ajuda',navigation:'Ajuda LivaSports',reviewed:'Atualizado em',related:'Veja também',football:'Ver partidas'},
  mx:{eyebrow:'Ayuda',navigation:'Ayuda LivaSports',reviewed:'Actualizado el',related:'Ver también',football:'Ver partidos'},
  en:{eyebrow:'Help',navigation:'LivaSports help',reviewed:'Updated',related:'See also',football:'Browse matches'},
} as const);
const baseHelpContent:Record<'br'|'mx'|'en',Record<HelpKind,HelpArticle>>={
 br:{
  ...marketHelp.br,
  comparison:{title:'Como funciona a comparação de odds da LivaSports',intro:'A LivaSports mostra, lado a lado, as odds pré-jogo registradas para as casas de apostas cobertas. Você não precisa de conta nem de aposta para consultar.',sections:[
   {title:'Protocolo para uma comparação verificável',body:'Comece pela mesma partida: confira competição, mandante, visitante e início. Compare o mesmo mercado, resultado e linha — por exemplo, total de gols acima de 2,5 não é o mesmo que acima de 3,5. Confira o horário de observação e a identificação de preço próprio ou aproximado antes de comparar valores. Uma cotação ausente não vale zero e não deve entrar na comparação.'},
   {title:'Como citar a comparação em uma matéria',body:'Use o endereço da partida consultada, identifique os times e a competição, registre a data e o horário da consulta com fuso, o mercado, a linha e o horário de observação exibido. Indique se o preço era próprio ou aproximado. Vincule também esta metodologia para explicar a cobertura. Uma página atualizável não comprova, sozinha, qual preço estava disponível no passado; preserve seu registro editorial da consulta.'},
   {title:'O que uma diferença de preços permite afirmar',body:'Odds diferentes mostram preços diferentes para a mesma seleção naquele recorte de cobertura e tempo. Não demonstram, por si só, valor de aposta, erro de uma casa, probabilidade verdadeira nem garantia de ganho. Não extrapole a amostra das casas exibidas para todo o mercado. A ausência de cobertura não indica ausência da partida ou do mercado.'},
   {title:'Limites de uso e transparência editorial',body:'Esta página documenta a consulta pública, não concede licença para redistribuir bases de terceiros nem oferece um arquivo histórico de odds. A LivaSports pode receber remuneração por links de afiliados identificados como publicidade; isso não transforma uma comparação em recomendação. Ao citar, mantenha visíveis a origem, o momento e as limitações do dado.'},
   {title:'De onde vêm as odds',body:'As odds exibidas são cotações pré-jogo registradas pela fonte de dados coberta. A validade depende da cotação e da proximidade do início; não existe um prazo único de 15 minutos para todos os jogos. Preços vencidos, suspensos ou encerrados deixam de ser apresentados como vigentes. Confira a observação e confirme o preço na casa.'},
   {title:'Preço próprio e preço aproximado',body:'Quando existe uma cotação da própria casa para o mercado, ela aparece como preço real dessa casa. Quando a fonte não informa a cotação de uma casa, a LivaSports pode exibir um preço aproximado, baseado na cotação de outra casa coberta. Esse valor é sempre identificado como aproximado e nunca é apresentado como cotação confirmada da casa.'},
   {title:'Por que a odd pode ser diferente na casa',body:'As casas alteram as odds ao longo do tempo, aplicam margens próprias e podem suspender mercados. O que você vê na LivaSports é a última observação registrada, não uma garantia de preço. Confira sempre a odd no site da casa antes de qualquer decisão.'},
   {title:'Melhor preço e cobertura',body:'A marcação de melhor preço compara apenas as casas exibidas naquele momento e considera apenas o valor da odd. A cobertura de casas depende do país e da elegibilidade comercial de cada uma; o México não herda a cobertura do Brasil.'},
   {title:'Meu bilhete é planejamento',body:'O bilhete de visitante guarda até dez seleções neste navegador, uma por partida, para comparar a odd combinada entre as casas. Nenhuma aposta é feita na LivaSports. Links de saída para casas parceiras são identificados como publicidade e destinados a maiores de 18 anos.'},
  ],related:['decimalOdds','favorites']},
  decimalOdds:{title:'Como ler odds decimais e o retorno estimado',intro:'As odds na LivaSports usam o formato decimal. Este guia explica o que o número significa e como o retorno estimado do bilhete é calculado.',sections:[
   {title:'O que a odd decimal representa',body:'Uma odd decimal indica o retorno total por unidade apostada, incluindo o valor da aposta. Com odd 2,50, cada 1,00 devolveria 2,50 em caso de acerto: 1,50 de ganho mais 1,00 da aposta. Uma odd de 1,20 devolve 1,20 por unidade.'},
   {title:'Probabilidade implícita',body:'Dividir 1 pela odd indica a probabilidade implícita: 1 ÷ 2,50 = 0,40, ou 40%. Somando as probabilidades implícitas de todos os resultados de um mercado, o total costuma passar de 100%; a diferença é a margem da casa. A LivaSports mostra as odds como registradas e não recalcula esse valor.'},
   {title:'Odd combinada do bilhete',body:'No Meu bilhete, a odd combinada é o produto das odds de cada seleção. Duas seleções a 1,80 e 2,00 resultam em 3,60. Quando alguma seleção depende de um preço aproximado, a odd combinada também é marcada como aproximada.'},
   {title:'Retorno estimado',body:'O retorno estimado é o valor informado como aposta multiplicado pela odd combinada, arredondado a duas casas. Com 10,00 e odd combinada 3,60, o retorno estimado é 36,00. É um cálculo informativo: não considera regras, limites, impostos ou promoções de cada casa, e não é uma aposta feita.'},
   {title:'Odds mudam',body:'As odds registradas podem mudar antes do início da partida. Se uma seleção do bilhete for reprecificada, a LivaSports mostra a odd anterior e a atual. Apostar envolve risco de perda; informação esportiva não é recomendação de aposta.'},
  ],related:['comparison','favorites']},
  favorites:{title:'Favoritos e Meus jogos',intro:'Marque times, competições e partidas com a estrela para montar sua própria agenda em Meus jogos. Funciona sem conta e sincroniza quando você entra.',sections:[
   {title:'Como favoritar',body:'Toque na estrela ao lado de um time, de uma competição ou de uma partida. Cada tipo aceita até 50 favoritos. A mesma estrela remove o favorito.'},
   {title:'Sem conta: salvo neste navegador',body:'Sem entrar, os favoritos ficam guardados apenas neste navegador. Limpar os dados do site ou usar outro dispositivo não mostra a mesma lista.'},
   {title:'Com conta: sincronizado',body:'Ao entrar com Google ou com o link de acesso por e-mail, os favoritos guardados neste navegador são adicionados à sua conta uma única vez e passam a valer em qualquer dispositivo conectado. A página Conta mostra a contagem de favoritos.'},
   {title:'O que aparece em Meus jogos',body:'Meus jogos reúne as partidas dos seus times e competições favoritos e as partidas marcadas diretamente, com filtros para tudo, ao vivo, próximos e resultados. Os horários seguem o fuso horário selecionado.'},
   {title:'Privacidade',body:'Favoritos não aparecem em páginas públicas, em resultados de busca nem em previews sociais. Avisos de partida não fazem parte desta versão.'},
  ],related:['comparison','decimalOdds']},
 },
 mx:{
  ...marketHelp.mx,
  comparison:{title:'Cómo funciona la comparación de cuotas de LivaSports',intro:'LivaSports muestra, lado a lado, las cuotas prepartido registradas de las casas de apuestas cubiertas. No necesitas cuenta ni apostar para consultarlas.',sections:[
   {title:'De dónde vienen las cuotas',body:'Las cuotas mostradas son cotizaciones prepartido registradas por la fuente de datos cubierta. Su vigencia depende de la cotización y la proximidad del inicio: no hay un plazo único de 15 minutos para todos los partidos. Los precios vencidos, suspendidos o cerrados dejan de presentarse como vigentes. Comprueba la observación y confirma el precio en la casa.'},
   {title:'Precio propio y precio aproximado',body:'Cuando existe una cotización de la propia casa para el mercado, se muestra como precio real de esa casa. Cuando la fuente no informa la cotización de una casa, LivaSports puede mostrar un precio aproximado, basado en la cotización de otra casa cubierta. Ese valor siempre se identifica como aproximado y nunca se presenta como cotización confirmada de la casa.'},
   {title:'Por qué la cuota puede ser distinta en la casa',body:'Las casas cambian sus cuotas con el tiempo, aplican márgenes propios y pueden suspender mercados. Lo que ves en LivaSports es la última observación registrada, no una garantía de precio. Verifica siempre la cuota en el sitio de la casa antes de cualquier decisión.'},
   {title:'Mejor precio y cobertura',body:'La marca de mejor precio compara solo las casas mostradas en ese momento y considera únicamente el valor de la cuota. La cobertura de casas depende del país y de la elegibilidad comercial de cada una; México no hereda la cobertura de Brasil.'},
   {title:'Mi boleto es planificación',body:'El boleto de visitante guarda hasta diez selecciones en este navegador, una por partido, para comparar la cuota combinada entre casas. En LivaSports no se realiza ninguna apuesta. Los enlaces de salida a casas asociadas se identifican como publicidad y son para mayores de 18 años.'},
  ],related:['decimalOdds','favorites']},
  decimalOdds:{title:'Cómo leer cuotas decimales y el retorno estimado',intro:'Las cuotas en LivaSports usan el formato decimal. Esta guía explica qué significa el número y cómo se calcula el retorno estimado del boleto.',sections:[
   {title:'Qué representa la cuota decimal',body:'Una cuota decimal indica el retorno total por unidad apostada, incluido el importe de la apuesta. Con cuota 2.50, cada 1.00 devolvería 2.50 si acierta: 1.50 de ganancia más 1.00 de la apuesta. Una cuota de 1.20 devuelve 1.20 por unidad.'},
   {title:'Probabilidad implícita',body:'Dividir 1 entre la cuota indica la probabilidad implícita: 1 ÷ 2.50 = 0.40, es decir, 40%. Al sumar las probabilidades implícitas de todos los resultados de un mercado, el total suele superar el 100%; la diferencia es el margen de la casa. LivaSports muestra las cuotas tal como se registraron y no recalcula ese valor.'},
   {title:'Cuota combinada del boleto',body:'En Mi boleto, la cuota combinada es el producto de las cuotas de cada selección. Dos selecciones a 1.80 y 2.00 dan 3.60. Cuando alguna selección depende de un precio aproximado, la cuota combinada también se marca como aproximada.'},
   {title:'Retorno estimado',body:'El retorno estimado es el importe indicado como apuesta multiplicado por la cuota combinada, redondeado a dos decimales. Con 10.00 y cuota combinada 3.60, el retorno estimado es 36.00. Es un cálculo informativo: no considera reglas, límites, impuestos ni promociones de cada casa, y no es una apuesta realizada.'},
   {title:'Las cuotas cambian',body:'Las cuotas registradas pueden cambiar antes del inicio del partido. Si una selección del boleto cambia de precio, LivaSports muestra la cuota anterior y la actual. Apostar implica riesgo de pérdida; la información deportiva no es una recomendación de apuesta.'},
  ],related:['comparison','favorites']},
  favorites:{title:'Favoritos y Mis partidos',intro:'Marca equipos, competiciones y partidos con la estrella para armar tu propia agenda en Mis partidos. Funciona sin cuenta y se sincroniza cuando inicias sesión.',sections:[
   {title:'Cómo marcar favoritos',body:'Toca la estrella junto a un equipo, una competición o un partido. Cada tipo admite hasta 50 favoritos. La misma estrella quita el favorito.'},
   {title:'Sin cuenta: guardado en este navegador',body:'Sin iniciar sesión, los favoritos se guardan solo en este navegador. Borrar los datos del sitio o usar otro dispositivo no muestra la misma lista.'},
   {title:'Con cuenta: sincronizado',body:'Al iniciar sesión con Google o con el enlace de acceso por correo, los favoritos guardados en este navegador se agregan a tu cuenta una sola vez y quedan disponibles en cualquier dispositivo conectado. La página Cuenta muestra el conteo de favoritos.'},
   {title:'Qué aparece en Mis partidos',body:'Mis partidos reúne los partidos de tus equipos y competiciones favoritos y los partidos marcados directamente, con filtros para todos, en vivo, próximos y resultados. Los horarios siguen la zona horaria seleccionada.'},
   {title:'Privacidad',body:'Los favoritos no aparecen en páginas públicas, en resultados de búsqueda ni en vistas previas sociales. Los avisos de partido no forman parte de esta versión.'},
  ],related:['comparison','decimalOdds']},
 },
 en:{
  ...marketHelp.en,
  comparison:{title:'How LivaSports odds comparison works',intro:'LivaSports shows recorded pre-match odds from the covered bookmakers side by side. No account and no bet are needed to look.',sections:[
   {title:'Where the odds come from',body:'Displayed odds are pre-match quotes recorded from the covered data source. Validity depends on the quote and proximity to kick-off; there is no single 15-minute lifetime for every match. Expired, suspended and closed prices are no longer presented as current. Check the observation and confirm the price at the bookmaker.'},
   {title:'Own price versus approximate price',body:'When the bookmaker\'s own quote exists for a market, it is shown as that bookmaker\'s real price. When the source does not report a bookmaker\'s quote, LivaSports may show an approximate price based on another covered bookmaker\'s quote. That value is always labelled as approximate and is never presented as a confirmed price at the bookmaker.'},
   {title:'Why the price can differ at the bookmaker',body:'Bookmakers move their odds over time, apply their own margins and may suspend markets. What you see on LivaSports is the last recorded observation, not a price guarantee. Always check the odds on the bookmaker\'s site before any decision.'},
   {title:'Best price and coverage',body:'The best-price label compares only the bookmakers displayed at that moment and considers the odds value alone. Bookmaker coverage depends on your country and each bookmaker\'s commercial eligibility; Mexico does not inherit Brazil\'s coverage.'},
   {title:'My Slip is planning',body:'The guest slip keeps up to ten selections in this browser, one per match, to compare the combined odds across bookmakers. No bet is placed on LivaSports. Outbound links to partner bookmakers are marked as advertising and intended for adults aged 18 or over.'},
  ],related:['decimalOdds','favorites']},
  decimalOdds:{title:'How to read decimal odds and the estimated return',intro:'Odds on LivaSports use the decimal format. This guide explains what the number means and how the slip\'s estimated return is calculated.',sections:[
   {title:'What a decimal price represents',body:'A decimal price is the total return per unit staked, including the stake. At 2.50, each 1.00 would return 2.50 if it wins: 1.50 profit plus the 1.00 stake. A price of 1.20 returns 1.20 per unit.'},
   {title:'Implied probability',body:'Dividing 1 by the price gives the implied probability: 1 ÷ 2.50 = 0.40, or 40%. Adding the implied probabilities of every outcome in a market usually exceeds 100%; the difference is the bookmaker\'s margin. LivaSports shows odds as recorded and does not recalculate this value.'},
   {title:'Combined odds on the slip',body:'On My Slip, the combined price is the product of each selection\'s odds. Two selections at 1.80 and 2.00 give 3.60. When any selection depends on an approximate price, the combined price is marked as approximate too.'},
   {title:'Estimated return',body:'The estimated return is the amount entered as the stake multiplied by the combined price, rounded to two decimals. With 10.00 and combined odds of 3.60, the estimated return is 36.00. It is informational: it ignores each bookmaker\'s rules, limits, taxes and promotions, and it is not a placed bet.'},
   {title:'Odds change',body:'Recorded odds can change before kick-off. If a slip selection is repriced, LivaSports shows the previous and the current price. Betting involves a risk of loss; sports information is not a betting recommendation.'},
  ],related:['comparison','favorites']},
  favorites:{title:'Favorites and My Matches',intro:'Star teams, competitions and matches to build your own schedule in My Matches. It works without an account and syncs when you sign in.',sections:[
   {title:'How to favorite',body:'Tap the star next to a team, a competition or a match. Each type holds up to 50 favorites. The same star removes the favorite.'},
   {title:'Without an account: saved in this browser',body:'When you are not signed in, favorites are stored only in this browser. Clearing site data or using another device will not show the same list.'},
   {title:'With an account: synced',body:'When you sign in with Google or with the email sign-in link, favorites stored in this browser are added to your account once and then apply on any signed-in device. The Account page shows your favorite counts.'},
   {title:'What My Matches shows',body:'My Matches gathers matches from your favorite teams and competitions plus the matches you starred directly, with filters for all, live, upcoming and results. Times follow your selected time zone.'},
   {title:'Privacy',body:'Favorites never appear on public pages, in search results or in social previews. Match notifications are not part of this release.'},
  ],related:['comparison','decimalOdds']},
 },
};

const content=withSpanishLocales(baseHelpContent);
// Regional help points to real domestic hubs; language never authorizes commercial access.
const countryContext={
 mx:{country:'México',comparison:'En México también se usa “momios” para hablar de cuotas. Busca Liga MX o Liga de Expansión MX y abre el partido concreto antes de comparar: Apertura y Clausura, jornada y equipos deben coincidir. El calendario, resultados y tabla están separados; una posición en la tabla no es un precio ni una probabilidad.',slip:'Para un boleto de partidos de Liga MX, comprueba jornada e inicio de cada partido. Los importes de ejemplo están expresados en unidades: si eliges MXN, 10.00 significa diez pesos mexicanos. Cambiar idioma o moneda no cambia las casas elegibles, y una columna sin precio vigente no constituye una oferta.'},
 co:{country:'Colombia',comparison:'Para Liga BetPlay / Primera A, empieza por el calendario colombiano y distingue la fase y la temporada que muestra la página. Resultados, tabla de posiciones y estadísticas responden a preguntas distintas. No confundas Primera A con el Torneo BetPlay de Primera B ni un marcador final con una cuota prepartido.',slip:'Para comparar partidos de Liga BetPlay, conserva local y visitante aun cuando consultes juegos de otra fase o temporada. Los ejemplos son unidades: un importe de 10.00 COP no equivale a diez pesos mexicanos ni a diez soles. Una comparación entre las casas mostradas no representa todas las casas del país.'},
 pe:{country:'Perú',comparison:'En Liga 1, consulta la temporada y la etapa disponibles antes de interpretar resultados o tabla. Los nombres Apertura y Clausura no identifican por sí solos el mismo partido: verifica fecha, local y visitante. Sigue el enlace al encuentro para revisar los mercados realmente disponibles; no supongas cobertura por aparecer en el calendario.',slip:'Para un boleto con partidos de Liga 1, confirma fecha y equipos de cada selección. En una comparación expresada en PEN, 10.00 corresponde a diez soles; los ejemplos no convierten monedas ni incluyen condiciones de promociones. La presencia de un equipo peruano no demuestra que una casa tenga una cuota vigente.'},
} as const;
function regionalHelp(locale:'mx'|'co'|'pe'):Record<HelpKind,HelpArticle>{
 const context=countryContext[locale];
 return {
  ...content[locale],
  comparison:{...content[locale].comparison,title:`Cómo comparar cuotas de fútbol en ${context.country}`,intro:`Compara el mismo partido, mercado y resultado en ${context.country}. Identifica cuotas vigentes, valores con ≈ y límites de cobertura antes de consultar una casa.`,sections:[...content[locale].comparison.sections,{title:`Fútbol y cobertura en ${context.country}`,body:context.comparison}],related:['markets','slipComparison','decimalOdds']},
  markets:{...content[locale].markets,title:`1X2, goles y ambos marcan: guía de fútbol en ${context.country}`,sections:[...content[locale].markets.sections,{title:`Consulta los partidos de ${context.country}`,body:context.comparison}]},
  slipComparison:{...content[locale].slipComparison,title:`Cómo comparar Mi boleto en ${context.country}`,sections:[...content[locale].slipComparison.sections,{title:`Comparaciones en ${context.country}`,body:context.slip}]},
 };
}
export const helpContent={...content,mx:regionalHelp('mx'),co:regionalHelp('co'),pe:regionalHelp('pe')};
