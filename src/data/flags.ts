// ── Country flag emoji from a draw's flag code ───────────────────────────────
// Wikipedia tennis draws tag each player with {{flagicon|XYZ}}, where XYZ is almost
// always an IOC 3-letter code (ESP, GER, SUI, NED…) — which differ from ISO 3166-1
// alpha-2 (ES, DE, CH, NL). We map the code to alpha-2, then to a flag emoji by pairing
// the two Regional Indicator Symbols. Used only for OFF-roster opponents in the live
// bracket; roster players carry their own flag. Unknown/neutral codes → no flag (undefined),
// which is the right outcome for neutral-flag athletes the draw leaves un-tagged.

// IOC (and a few common ISO-alpha-3) codes → ISO 3166-1 alpha-2. Broad enough to cover
// any nation that turns up in an ATP main draw; anything missing simply renders flagless.
const CODE_TO_ISO2: Record<string, string> = {
  ALG: 'DZ', ANG: 'AO', ARG: 'AR', ARM: 'AM', AUS: 'AU', AUT: 'AT', AZE: 'AZ',
  BAH: 'BS', BAR: 'BB', BEL: 'BE', BLR: 'BY', BIH: 'BA', BOL: 'BO', BRA: 'BR',
  BRN: 'BH', BRU: 'BN', BUL: 'BG', CAN: 'CA', CHI: 'CL', CHN: 'CN', CIV: 'CI',
  COL: 'CO', CRC: 'CR', CRO: 'HR', CYP: 'CY', CZE: 'CZ', DEN: 'DK', DOM: 'DO',
  ECU: 'EC', EGY: 'EG', ESA: 'SV', ESP: 'ES', EST: 'EE', FIN: 'FI', FRA: 'FR',
  GBR: 'GB', GEO: 'GE', GER: 'DE', GRE: 'GR', GUA: 'GT', HAI: 'HT', HKG: 'HK',
  HUN: 'HU', INA: 'ID', IND: 'IN', IRI: 'IR', IRL: 'IE', ISL: 'IS', ISR: 'IL',
  ITA: 'IT', JAM: 'JM', JPN: 'JP', KAZ: 'KZ', KOR: 'KR', KOS: 'XK', KUW: 'KW',
  LAT: 'LV', LBN: 'LB', LIB: 'LB', LIE: 'LI', LTU: 'LT', LUX: 'LU', MAR: 'MA',
  MAS: 'MY', MDA: 'MD', MEX: 'MX', MLT: 'MT', MNE: 'ME', MON: 'MC', NED: 'NL',
  NGR: 'NG', NOR: 'NO', NZL: 'NZ', PAK: 'PK', PAN: 'PA', PAR: 'PY', PER: 'PE',
  PHI: 'PH', POL: 'PL', POR: 'PT', PUR: 'PR', QAT: 'QA', ROU: 'RO', RSA: 'ZA',
  RUS: 'RU', SGP: 'SG', SIN: 'SG', SLO: 'SI', SMR: 'SM', SRB: 'RS', SUI: 'CH',
  SVK: 'SK', SWE: 'SE', SYR: 'SY', THA: 'TH', TPE: 'TW', TUN: 'TN', TUR: 'TR',
  UAE: 'AE', UKR: 'UA', URU: 'UY', USA: 'US', UZB: 'UZ', VEN: 'VE', VIE: 'VN',
  ZIM: 'ZW',
};

// A flag code from the draw ('ESP', 'GER', or already-alpha-2 'US') → flag emoji, or
// undefined if the code isn't recognised (renders flagless rather than as tofu/letters).
export function flagEmoji(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const c = code.trim().toUpperCase();
  const iso2 = c.length === 2 ? c : CODE_TO_ISO2[c];
  if (!iso2 || !/^[A-Z]{2}$/.test(iso2)) return undefined;
  return String.fromCodePoint(...[...iso2].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
