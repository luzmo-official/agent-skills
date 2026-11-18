export const LOCALES = ['en', 'en-US', 'en-GB', 'nl', 'fr', 'de', 'zh', 'zh_cn', 'zh_tw', 'zh-CN', 'zh-TW', 'ja', 'ko', 'it', 'es', 'pt', 'ru', 'da', 'no', 'sv', 'fi', 'hu', 'pl', 'tr', 'cs', 'hy'];
export const DESCRIPTION_MAX = 4000;
export const AGENT_NAME_MAX = 150;
export const RULE_NAME_MAX = 120;
export const RULE_CONTENT_MAX = 20000;
// Working budgets: stricter than Luzmo's limits. Descriptions render in a tooltip; rule text and AI context fill IQ prompts.
export const DESCRIPTION_BUDGET = 300;
export const RULE_CONTENT_BUDGET = 5000;
export const DATASET_CONTEXT_BUDGET = 1000;
export const FIELD_CONTEXT_BUDGET = 450;
export const AGENT_CAPABILITIES = ['data_analysis', 'chart_creation', 'dashboard_creation'];

export const isLocale = value => LOCALES.includes(value);

export function localizedProblems(value, { field, max = Infinity, requireTrimmed = false, only = null } = {}) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [`${field} must be a locale map such as {"en": "..."}`];
  const problems = [], locales = Object.keys(value);
  if (locales.includes('zh_tw') && locales.includes('zh-TW') || locales.includes('zh_cn') && locales.includes('zh-CN')) problems.push(`${field} cannot contain both a legacy (zh_tw/zh_cn) and a current (zh-TW/zh-CN) Chinese locale`);
  for (const [locale, text] of Object.entries(value)) {
    if (only && !only.has(locale)) continue;
    if (!isLocale(locale)) problems.push(`${field}.${locale}: unsupported locale; Luzmo accepts ${LOCALES.join(', ')}`);
    if (typeof text !== 'string') { problems.push(`${field}.${locale}: must be a string`); continue; }
    if (text.length > max) problems.push(`${field}.${locale}: ${text.length} characters exceeds the Luzmo limit of ${max}`);
    if (requireTrimmed && text !== text.trim()) problems.push(`${field}.${locale}: remove leading/trailing whitespace`);
  }
  return problems;
}
