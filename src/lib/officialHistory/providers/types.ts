export interface CountryProviderConfig {
  countryCode: string; // ISO 3166-1 alpha-2, uppercase
  countryName: string;
  authority: string;
  institution: string;
  /** Bare hostnames considered official for this country's automated validator. */
  allowedDomains: string[];
}
