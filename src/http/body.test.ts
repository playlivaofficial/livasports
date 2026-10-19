import {it,expect} from 'vitest';
import {boundedJson} from './body';
it('parses bounded JSON without legacy product imports',async()=>{expect(await boundedJson(new Request('https://livasports.com/api/events',{method:'POST',body:'{"text":"México"}'}))).toEqual({text:'México'});});
it('bounds UTF-8 bytes, not string length',async()=>{await expect(boundedJson(new Request('https://livasports.com/api/events',{method:'POST',body:'"éé"'}),5)).rejects.toThrow('BODY_TOO_LARGE');});
it('rejects malformed bodies and accepts a genuinely absent body',async()=>{await expect(boundedJson(new Request('https://livasports.com/api/events',{method:'POST',body:'{' }))).rejects.toThrow();expect(await boundedJson(new Request('https://livasports.com/api/events'))).toBeNull();});
