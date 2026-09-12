// Controlled capability evidence only. Never imported by application read routes.
export class OddsPapiAuditClient {
  constructor(apiKey, state, save, limit) {
    if (!apiKey) throw new Error('ODDSPAPI_API_KEY is not configured');
    this.apiKey = apiKey; this.state = state; this.save = save; this.limit = limit;
  }
  sanitize(value) {
    if (typeof value === 'string') return value.split(this.apiKey).join('[REDACTED]');
    if (Array.isArray(value)) return value.map(item => this.sanitize(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/api.?key|token|secret|authorization|email|subscription_id|betslip/i.test(key))
      .map(([key, item]) => [key, key === 'fixturePath' ? (() => { try { return new URL(item).hostname; } catch { return null; } })() : this.sanitize(item)]));
  }
  async get(path, query) {
    if (!['account','bookmakers','markets','tournaments','fixtures','fixture','odds','odds-by-tournaments'].includes(path)) throw new Error('Audit endpoint is not allowed');
    const cacheKey = `${path}:${JSON.stringify(query)}`;
    if (this.state.responses[cacheKey]) return this.state.responses[cacheKey].data;
    if (this.state.requests.length >= this.limit) throw new Error('M5 capability audit hard cap reached');
    const previous = this.state.requests.at(-1);
    if (previous) await new Promise(resolve => setTimeout(resolve, Math.max(0, 2500 - (Date.now() - Date.parse(previous.observedAt ?? previous.at)))));
    const entry = { at: new Date().toISOString(), endpoint: `/v4/${path}`, query, status: 'STARTED' };
    this.state.requests.push(entry); this.save();
    const url = new URL(`https://api.oddspapi.io/v4/${path}`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    url.searchParams.set('apiKey', this.apiKey);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      const body = await response.json(); entry.status = response.status;
      entry.observedAt = new Date().toISOString();
      const safe = this.sanitize(body);
      if (!response.ok) { entry.error = safe; this.save(); throw new Error(JSON.stringify(entry)); }
      this.state.responses[cacheKey] = { observedAt: entry.observedAt, data: safe }; this.save();
      return safe;
    } catch (error) { if (entry.status === 'STARTED') entry.status = 'NETWORK_ERROR'; this.save(); throw error; }
  }
}
