import type { BookmakerRepository } from '@/repositories/contracts';

export class BookmakerService {
  constructor(private readonly repository: BookmakerRepository) {}

  listForCountry(countryCode: string) {
    return this.repository.listEnabledForCountry(countryCode.toUpperCase());
  }
}
