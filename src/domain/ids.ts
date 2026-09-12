import { randomUUID } from 'node:crypto';

declare const brand: unique symbol;
export type DomainId<Entity extends string> = string & { readonly [brand]: Entity };

export type CountryId = DomainId<'Country'>;
export type SportId = DomainId<'Sport'>;
export type CompetitionId = DomainId<'Competition'>;
export type SeasonId = DomainId<'Season'>;
export type TeamId = DomainId<'Team'>;
export type PlayerId = DomainId<'Player'>;
export type FixtureId = DomainId<'Fixture'>;
export type BookmakerId = DomainId<'Bookmaker'>;
export type MarketId = DomainId<'Market'>;
export type OddsQuoteId = DomainId<'OddsQuote'>;

export function newDomainId<Entity extends string>(): DomainId<Entity> {
  return randomUUID() as DomainId<Entity>;
}

export function domainId<Entity extends string>(value: string): DomainId<Entity> {
  if (!value) throw new Error('Domain IDs cannot be empty');
  return value as DomainId<Entity>;
}
