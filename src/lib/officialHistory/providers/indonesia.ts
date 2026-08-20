import { CountryProviderConfig } from './types';

/**
 * Indonesia — 1 Ramadan is officially announced by the Government of Indonesia
 * (Kementerian Agama RI / Ministry of Religious Affairs) via Sidang Isbat.
 * This is DISTINCT from Muhammadiyah's own hisab wujudul hilal calendar
 * (data/ground_truth_muhammadiyah.json) and from MUI, which is a scholars'
 * council, not the government authority that issues the official civil
 * decision (Keputusan Menteri Agama).
 */
export const INDONESIA_PROVIDER: CountryProviderConfig = {
  countryCode: 'ID',
  countryName: 'Indonesia',
  authority: 'Government of Indonesia',
  institution: 'Ministry of Religious Affairs (Kementerian Agama RI)',
  allowedDomains: ['kemenag.go.id', 'setneg.go.id', 'setkab.go.id', 'mahkamahagung.go.id'],
};
