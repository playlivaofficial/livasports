import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {LiveOddsSlot} from './LiveOddsSlot';

describe('live odds listing honesty',()=>{
  it('shows an unavailable live state instead of pregame prices',()=>{
    const html=renderToStaticMarkup(<LiveOddsSlot locale="en" live/>);
    expect(html).toContain('Live odds unavailable');
    expect(html).toContain('data-live-odds="UNAVAILABLE"');
    expect(html).toContain('PLAN-BLOCKED');
    expect(html).not.toContain('1.80');
    expect(html).not.toContain('listing-odds-price');
  });
});
