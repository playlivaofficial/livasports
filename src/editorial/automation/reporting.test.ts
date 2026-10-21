import {describe,it,expect} from 'vitest';
import {executionSummary} from './reporting';
describe('Owner usage reporting',()=>{
 it('does not present a legacy completed row with a failed model call as success or free usage',()=>expect(executionSummary({status:'completed',result:{generation:'MODEL_RATE_LIMITED',modelUsage:{calls:1,stages:{}}}})).toEqual({calls:1,reported:0,unknown:1,status:'Model failed — no publication'}));
 it('distinguishes measured stage costs from unreported later calls',()=>expect(executionSummary({status:'failed',result:{generation:'MODEL_UNAVAILABLE',modelUsage:{calls:2,stages:{original:{microUsd:150}}}}})).toMatchObject({calls:2,reported:1,unknown:1}));
 it('shows completed measured generation without unknown cost claims',()=>expect(executionSummary({status:'completed',result:{generation:'VALIDATED',modelUsage:{calls:3,stages:{original:{microUsd:150},translation:{microUsd:200},audit:{microUsd:300}}}}})).toMatchObject({calls:3,reported:3,unknown:0,status:'completed'}));
});
