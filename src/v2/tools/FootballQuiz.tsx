'use client';
import {useEffect,useRef,useState} from 'react';
import type {InterfaceLocale} from '@/localization/interface';
import {translated} from '../content';
import {v2Copy} from '../copy';
import {quizQuestions} from './quiz';
export function FootballQuiz({locale}:{locale:InterfaceLocale}){
  const text=v2Copy(locale),[answers,setAnswers]=useState<number[]>([]),[index,setIndex]=useState(0),[finished,setFinished]=useState(false),[message,setMessage]=useState('');
  const heading=useRef<HTMLHeadingElement>(null),mounted=useRef(false);
  useEffect(()=>{if(mounted.current)heading.current?.focus();else mounted.current=true;},[index,finished]);
  const question=quizQuestions[index],selected=answers[index],score=answers.reduce((total,answer,i)=>total+(answer===quizQuestions[i].correct?1:0),0);
  return <section className="v2-quiz" aria-label={text.quiz}>{finished?<><span className="v2-eyebrow">{text.score}</span><h2 ref={heading} tabIndex={-1} className="v2-quiz-score">{score}<span> / {quizQuestions.length}</span></h2><p>{text.quizLead}</p><button className="v2-button" type="button" onClick={()=>{setAnswers([]);setIndex(0);setFinished(false);setMessage('');}}>{text.restart}</button><button className="v2-button v2-button-secondary" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(`${text.quiz} · LivaSports: ${score}/${quizQuestions.length}`);setMessage(text.copied);}catch{setMessage(text.copyFailed);}}}>{text.share}</button><p role="status">{message}</p></>:<><div className="v2-quiz-progress"><span>{text.question} {index+1} / {quizQuestions.length}</span><span>{score} ✓</span></div><progress value={index} max={quizQuestions.length} aria-label={text.question}/><h2 ref={heading} tabIndex={-1}>{translated(question.question,locale)}</h2><div className="v2-quiz-answers">{question.options.map((option,i)=><button type="button" key={i} disabled={selected!==undefined} className={selected!==undefined?(i===question.correct?'is-correct':i===selected?'is-incorrect':''):''} onClick={()=>setAnswers([...answers,i])}><b>{String.fromCharCode(65+i)}</b>{translated(option,locale)}</button>)}</div>{selected!==undefined?<div className="v2-quiz-feedback" role="status"><strong>{selected===question.correct?text.correct:text.incorrect}</strong><p>{translated(question.explanation,locale)}</p><button className="v2-button" type="button" onClick={()=>index===quizQuestions.length-1?setFinished(true):setIndex(index+1)}>{index===quizQuestions.length-1?text.finish:text.next}<span aria-hidden="true">→</span></button></div>:null}</>}</section>;
}
