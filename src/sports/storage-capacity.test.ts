import {expect,it,vi} from 'vitest';
import {sportsStorageCapacity} from './storage-capacity';
it('stops a bulk import before exhausting the remaining space for application writes',async()=>{
  const query=vi.fn(async()=>({rows:[{limit_bytes:String(512*1024*1024),used_bytes:String(490*1024*1024)}]}));
  expect(await sportsStorageCapacity({query} as never)).toEqual({ready:false,limitMiB:512,usedMiB:490});
  expect(query.mock.calls).toHaveLength(1);
});
it('allows an expanded or unlimited storage allowance',async()=>{
  for(const limit_bytes of [null,String(10*1024**3)])expect((await sportsStorageCapacity({query:async()=>({rows:[{limit_bytes,used_bytes:String(512*1024**2)}]})} as never)).ready).toBe(true);
});
