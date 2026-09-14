import {expect,it} from 'vitest';
import {runSportsJobs} from './work-queue';
it('bounds work and completes in-flight writes before rejecting',async()=>{
  let active=0,max=0;const finished:number[]=[];
  await expect(runSportsJobs([0,1,2,3,4],2,async n=>{
    active++;max=Math.max(max,active);
    await new Promise(resolve=>setTimeout(resolve,n===0?1:10));
    active--;finished.push(n);if(n===0)throw Error('stop');
  })).rejects.toThrow('stop');
  expect(max).toBe(2);expect(active).toBe(0);expect(finished.sort()).toEqual([0,1]);
});
