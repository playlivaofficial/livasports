import {describe,expect,it} from 'vitest';
import {cardinal,ordinal,shapeBeats,spokenClock,spokenLine} from './spoken';

describe('PT-BR spoken text',()=>{
  it('says numbers, ordinals and clock times the Brazilian way',()=>{
    expect(cardinal(21)).toBe('vinte e um');expect(cardinal(2,true)).toBe('duas');expect(cardinal(200,true)).toBe('duzentas');
    expect(ordinal(3)).toBe('terceiro');expect(ordinal(12)).toBe('décimo segundo');expect(ordinal(1,true)).toBe('primeira');
    expect(spokenClock(16,0)).toBe('às dezesseis horas');expect(spokenClock(21,30)).toBe('às vinte e uma e trinta');expect(spokenClock(1,0)).toBe('à uma hora');
  });
  it('turns kickoff captions into a sentence',()=>{
    expect(spokenLine('Brasileirão Série A · sáb. · 27/09, 16:00',{mode:'EDITORIAL'})).toBe('Brasileirão, sábado, dia vinte e sete, às dezesseis horas.');
    expect(spokenLine('ter. · 22/09, 15:00 · horário de Brasília',{mode:'EDITORIAL'})).toBe('Terça, dia vinte e dois, às quinze horas, no horário de Brasília.');
  });
  it('reads matchups, brands, table slang and agreement naturally',()=>{
    expect(spokenLine('Flamengo x Palmeiras',{mode:'EDITORIAL'})).toBe('Flamengo contra Palmeiras.');
    expect(spokenLine('Abre no LivaSports.com e compara.',{mode:'ENERGETIC'})).toBe('Abre no Liva Sports ponto com e compara.');
    expect(spokenLine('Duelo direto no G4.',{mode:'EDITORIAL'})).toBe('Duelo direto no gê quatro.');
    expect(spokenLine('A distância antes da rodada: 2 posições.',{mode:'EDITORIAL'})).toBe('A distância antes da rodada. Duas posições.');
    expect(spokenLine('Atlético-MG x RB Bragantino',{mode:'EDITORIAL'})).toBe('Atlético Mineiro contra Bragantino.');
    expect(spokenLine('Rodada 30',{mode:'EDITORIAL'})).toBe('Trigésima rodada.');
  });
  it('never touches decimal prices and strips hashtags and links',()=>{
    expect(spokenLine('Odd de 1,85 #Flamengo https://livasports.com/x',{mode:'EDITORIAL'})).toBe('Odd de 1,85.');
  });
  it('gives the energetic hook a landing and splits run-on lines into beats',()=>{
    expect(spokenLine('Para tudo: tem jogaço chegando',{mode:'ENERGETIC',hook:true})).toBe('Para tudo! Tem jogaço chegando!');
    expect(spokenLine('Para tudo: tem jogaço chegando',{mode:'EDITORIAL',hook:true})).toBe('Para tudo. Tem jogaço chegando.');
    const long=shapeBeats('Dois times do topo se enfrentam nesta rodada decisiva, e quem vencer sai na frente na briga pela liderança',{mode:'ENERGETIC'});
    expect(long.split(/(?<=[.!?])\s/).length).toBe(2);expect(long.endsWith('.')).toBe(true);
    expect(spokenLine('',{mode:'EDITORIAL'})).toBe('');
  });
  it('is deterministic',()=>{
    const line='Na classificação: Flamengo, 3º. Palmeiras, 12º.';
    expect(spokenLine(line,{mode:'EDITORIAL'})).toBe(spokenLine(line,{mode:'EDITORIAL'}));
  });
});
