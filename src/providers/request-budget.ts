export interface RequestBudgetSnapshot { used: number; limit: number; remaining: number; period: string; }

export class ProviderRequestBudget {
  private used = 0;
  private period = new Date().toISOString().slice(0, 7);

  constructor(private readonly monthlyLimit: number) {
    if (!Number.isInteger(monthlyLimit) || monthlyLimit <= 0) throw new Error('Monthly request limit must be positive');
  }

  consume(count = 1, now = new Date()): RequestBudgetSnapshot {
    const period = now.toISOString().slice(0, 7);
    if (period !== this.period) { this.period = period; this.used = 0; }
    if (this.used + count > this.monthlyLimit) throw new Error('Provider monthly request budget exhausted');
    this.used += count;
    return this.snapshot();
  }

  snapshot(): RequestBudgetSnapshot {
    return { used: this.used, limit: this.monthlyLimit, remaining: this.monthlyLimit - this.used, period: this.period };
  }
}
