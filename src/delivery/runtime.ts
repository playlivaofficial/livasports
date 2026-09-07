import 'server-only';
import { CacheCoordinator, MemoryCacheStore } from '@/cache/cache';
import { loadOddsRuntimeConfig } from '@/config/odds';
import { loadProviderEnvironment } from '@/config/server';
import type { PageKey, SiteLocale } from '@/config/i18n';
import { ProviderMappingService } from '@/domain/provider-mapping';
import { ProviderRequestBudget } from '@/providers/request-budget';
import { OddsPapiAdapter } from '@/providers/oddspapi/OddsPapiAdapter';
import { HttpOddsPapiGateway } from '@/providers/oddspapi/HttpOddsPapiGateway';
import { SportmonksAdapter } from '@/providers/sportmonks/SportmonksAdapter';
import { HttpSportmonksGateway } from '@/providers/sportmonks/HttpSportmonksGateway';
import { InMemoryProviderEntityMappingRepository } from '@/repositories/provider-mapping.repository';
import { M2DataDeliveryService } from './M2DataDeliveryService';

let runtime: M2DataDeliveryService | null = null;

function createRuntime(): M2DataDeliveryService {
  const environment = loadProviderEnvironment();
  const oddsConfig = loadOddsRuntimeConfig();
  const cache = new CacheCoordinator(new MemoryCacheStore());
  const mappings = new ProviderMappingService(new InMemoryProviderEntityMappingRepository());
  const sports = environment.sportmonksApiKey
    ? new SportmonksAdapter(new HttpSportmonksGateway(environment.sportmonksApiKey, environment.sportmonksBaseUrl), mappings)
    : null;
  const odds = environment.oddsPapiApiKey
    ? new OddsPapiAdapter(new HttpOddsPapiGateway(environment.oddsPapiApiKey, cache,
      new ProviderRequestBudget(oddsConfig.oddsPapiMonthlyRequestLimit), environment.oddsPapiBaseUrl, oddsConfig.oddsPapiMinRefreshSeconds), mappings)
    : null;
  return new M2DataDeliveryService(sports, odds, cache, {
    oddsStaleAfterSeconds: oddsConfig.staleAfterSeconds,
    onDiagnostic: event => console.info(`[LivaSports M2] ${JSON.stringify(event)}`),
  });
}

export function loadM2PageData(locale: SiteLocale, page: PageKey) {
  runtime ??= createRuntime();
  return runtime.load(locale, page);
}
