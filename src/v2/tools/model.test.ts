import {describe,it,expect} from 'vitest';
import {formations,formationPlayers,initialBoard,parseBoard,clampPosition,decimalOdds,calculateManualOdds,convertedOdds} from './model';
import {quizQuestions} from './quiz';
describe('local football boards',()=>{
 it.each(Object.keys(formations) as (keyof typeof formations)[])('%s has two valid elevens and unique stable player identities',formation=>{
  const players=[...formationPlayers(formation),...formationPlayers(formation,1)];expect(players).toHaveLength(22);expect(new Set(players.map(p=>p.id)).size).toBe(22);
  expect(parseBoard(JSON.stringify({...initialBoard(),formation,players}))).not.toBeNull();
 });
 it('round-trips names, notes, formation, opposition and arrows without uploads',()=>{const state=initialBoard();state.players[0].name='María <10>';state.title='Equipo local';state.notes='Abrir el campo';state.opposition=true;state.arrows=[{from:[20,30],to:[80,70]}];expect(parseBoard(JSON.stringify(state))).toEqual(state);});
 it.each(['not json','null','[]','{}','x'.repeat(24001)])('rejects malformed or oversized storage',input=>{expect(parseBoard(input)).toBeNull();});
 it.each(['version','formation','title','notes','players','arrows','opposition'])('does not trust tampered %s',field=>{const state={...initialBoard(),[field]:null};expect(parseBoard(JSON.stringify(state))).toBeNull();});
 it('rejects duplicate players, out-of-range coordinates and unexpected teams',()=>{for(const mutate of [(s:ReturnType<typeof initialBoard>)=>{s.players[1].id=1;},(s:ReturnType<typeof initialBoard>)=>{s.players[0].x=101;},(s:ReturnType<typeof initialBoard>)=>{s.players[0].team=1;}]){const state=initialBoard();mutate(state);expect(parseBoard(JSON.stringify(state))).toBeNull();}});
 it('bounds movement and arrow count',()=>{expect(clampPosition(-100)).toBe(7);expect(clampPosition(101)).toBe(93);const state=initialBoard();state.arrows=Array.from({length:31},()=>({from:[1,1] as [number,number],to:[2,2] as [number,number]}));expect(parseBoard(JSON.stringify(state))).toBeNull();});
});
describe('manual odds arithmetic, not bookmaker offers',()=>{
 it.each([['2.50','decimal',2.5],['2,50','decimal',2.5],['3/2','fractional',2.5],['+150','american',2.5],['-200','american',1.5]] as const)('converts %s %s', (input,format,expected)=>{expect(decimalOdds(input,format)).toBe(expected);});
 it.each(['','0','1','-2','Infinity','NaN','0x10','2abc','1e3','1001'])('rejects invalid decimal %s',input=>{expect(decimalOdds(input,'decimal')).toBeNull();});
 it.each(['1/0','1','-1/2','0/2','1/Infinity'])('rejects invalid fraction %s',input=>{expect(decimalOdds(input,'fractional')).toBeNull();});
 it.each(['0','99','-99','+1','abc'])('rejects invalid American %s',input=>{expect(decimalOdds(input,'american')).toBeNull();});
 it.each([1,3,5,10])('calculates %i independent legs from user input',count=>{const result=calculateManualOdds(Array(count).fill('2'),'decimal',10)!;expect(result.combined).toBe(2**count);expect(result.total).toBe(10*2**count);expect(result.profit).toBe(10*(2**count-1));expect(result.probability).toBe(100/2**count);});
 it.each([-1,1000001,NaN,Infinity])('rejects invalid stake %s',stake=>{expect(calculateManualOdds(['2'],'decimal',stake)).toBeNull();});
 it('rejects missing, invalid or excessive legs; zero stake is valid',()=>{expect(calculateManualOdds([],'decimal',10)).toBeNull();expect(calculateManualOdds(Array(11).fill('2'),'decimal',10)).toBeNull();expect(calculateManualOdds(['2',''],'decimal',10)).toBeNull();expect(calculateManualOdds(['2'],'decimal',0)?.total).toBe(0);});
 it('never rounds a legitimate sub-hundredth price to a zero fraction',()=>{expect(convertedOdds(1.001).fractional).toBe('1/1000');expect(convertedOdds(2.5)).toEqual({fractional:'3/2',american:'+150'});expect(convertedOdds(1.5)).toEqual({fractional:'1/2',american:'-200'});expect(convertedOdds(1).fractional).toBe('—');});
});
describe('complete translated quiz',()=>{
 it('contains ten independently answerable questions and complete explanations',()=>{expect(quizQuestions).toHaveLength(10);for(const question of quizQuestions){expect(question.options.length).toBeGreaterThanOrEqual(2);expect(question.correct).toBeGreaterThanOrEqual(0);expect(question.correct).toBeLessThan(question.options.length);for(const language of ['es','en','pt'] as const){expect(question.question[language].length).toBeGreaterThan(10);expect(question.explanation[language].length).toBeGreaterThan(20);expect(new Set(question.options.map(option=>option[language])).size).toBe(question.options.length);}}});
});
