/** Provider-neutral contract used by the M0 validator. */
export class ProviderAdapter {
  /** @returns {Promise<{provider:string, fixtures:Array, odds:Array, diagnostics:Array}>} */
  async collectValidationSample(_options) {
    throw new Error('collectValidationSample() must be implemented');
  }
}
