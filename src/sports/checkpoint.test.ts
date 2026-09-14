import {describe,it,expect,vi,beforeEach} from 'vitest';
import {writeFile,rename} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
import {writeSportsCheckpoint} from './checkpoint';
vi.mock('node:fs/promises',()=>({writeFile:vi.fn(),rename:vi.fn()}));
vi.mock('node:timers/promises',()=>({setTimeout:vi.fn()}));
beforeEach(()=>vi.resetAllMocks());
describe('resumable sports checkpoint',()=>{
  it('retries a temporary Windows replacement lock without deleting the preserved checkpoint',async()=>{
    vi.mocked(rename).mockRejectedValueOnce({code:'EPERM'}).mockRejectedValueOnce({code:'EBUSY'}).mockResolvedValue(undefined);
    await writeSportsCheckpoint('checkpoint.json','["done"]');
    expect(writeFile).toHaveBeenCalledExactlyOnceWith('checkpoint-pending.json','["done"]');
    expect(rename).toHaveBeenCalledTimes(3);expect(rename).toHaveBeenLastCalledWith('checkpoint-pending.json','checkpoint.json');
    expect(setTimeout).toHaveBeenNthCalledWith(1,100);expect(setTimeout).toHaveBeenNthCalledWith(2,200);
  });
  it('stops on persistent or unrelated filesystem errors and leaves both files available for recovery',async()=>{
    vi.mocked(rename).mockRejectedValue({code:'EPERM'});
    await expect(writeSportsCheckpoint('checkpoint.json','[]')).rejects.toMatchObject({code:'EPERM'});
    expect(rename).toHaveBeenCalledTimes(6);
    vi.mocked(rename).mockReset().mockRejectedValue({code:'ENOSPC'});
    await expect(writeSportsCheckpoint('checkpoint.json','[]')).rejects.toMatchObject({code:'ENOSPC'});
    expect(rename).toHaveBeenCalledTimes(1);
  });
});
