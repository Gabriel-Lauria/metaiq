import {
  CampaignBudgetType,
  CampaignDestinationType,
  CampaignGender,
  CampaignInitialStatus,
  CampaignObjective,
  CampaignPlacement,
} from './campaign-builder.types';
import { DEFAULT_CTA, MetaCallToActionType } from './cta.constants';

export function normalizePromptText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parsePromptDecimal(value: string): number {
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

export function toPromptTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function detectObjectiveFromPrompt(normalized: string): CampaignObjective {
  if (/(lead|leads|cadastro|captacao|captação|whatsapp|formulario|formulário)/i.test(normalized)) return 'OUTCOME_LEADS';
  if (/(alcance|awareness|reconhecimento|visibilidade)/i.test(normalized)) return 'REACH';
  return 'OUTCOME_TRAFFIC';
}

export function extractBudgetFromPrompt(prompt: string, normalized: string): number {
  const currencyMatch = normalized.match(/r\$\s*(\d{2,5}(?:[.,]\d{1,2})?)/i);
  if (currencyMatch?.[1]) return Math.round(parsePromptDecimal(currencyMatch[1]));

  const phrasedMatch = normalized.match(/(?:orcamento|orçamento|budget|investimento)\s*(?:de|em)?\s*(\d{2,5}(?:[.,]\d{1,2})?)/i);
  if (phrasedMatch?.[1]) return Math.round(parsePromptDecimal(phrasedMatch[1]));

  const dailyMatch = normalized.match(/(\d{2,5}(?:[.,]\d{1,2})?)\s*(?:por dia|\/dia|ao dia)/i);
  if (dailyMatch?.[1]) return Math.round(parsePromptDecimal(dailyMatch[1]));

  const generic = prompt.match(/\b(\d{2,5})\b/);
  return generic ? Number(generic[1]) : 0;
}

export function detectBudgetTypeFromPrompt(normalized: string): CampaignBudgetType {
  if (/(vitalicio|vitalício|total da campanha|campanha inteira|lifetime)/i.test(normalized)) return 'lifetime';
  return 'daily';
}

export function detectInitialStatusFromPrompt(normalized: string): CampaignInitialStatus {
  if (/(ativar agora|iniciar ativa|publicar ativa|subir ativa)/i.test(normalized)) return 'ACTIVE';
  return 'PAUSED';
}

export function detectDestinationTypeFromPrompt(normalized: string): CampaignDestinationType {
  if (/(whatsapp|messenger|direct|mensagens)/i.test(normalized)) return 'messages';
  if (/(formulario|formulário|lead ads|cadastro)/i.test(normalized)) return 'form';
  if (/\bapp\b|play store|app store|deep link/i.test(normalized)) return 'app';
  if (/(catalogo|catálogo|produtos)/i.test(normalized)) return 'catalog';
  return 'site';
}

export function detectCtaFromPrompt(normalized: string): MetaCallToActionType {
  if (/(whatsapp|falar|conversar|mensagens)/i.test(normalized)) return 'MESSAGE_PAGE';
  if (/(comprar|oferta|promo|promocao|promoção)/i.test(normalized)) return 'SHOP_NOW';
  if (/(cadastro|lead|inscricao|inscrição|signup|sign up)/i.test(normalized)) return 'SIGN_UP';
  if (/(agendar|marcar|reserva|booking)/i.test(normalized)) return 'BOOK_NOW';
  if (/(contato|contact|fale)/i.test(normalized)) return 'CONTACT_US';
  if (/(download|baixar)/i.test(normalized)) return 'DOWNLOAD';
  if (/(oferta|promocao|promoção|cupom)/i.test(normalized)) return 'GET_OFFER';
  return DEFAULT_CTA;
}

export function detectCountryFromPrompt(normalized: string, fallbackCountry: string): string {
  const countries: Array<{ pattern: RegExp; code: string }> = [
    { pattern: /\bbrasil\b|\bbr\b/, code: 'BR' },
    { pattern: /\bportugal\b|\bpt\b/, code: 'PT' },
    { pattern: /\bargentina\b|\bar\b/, code: 'AR' },
    { pattern: /\bmexico\b|\bm[eé]xico\b|\bmx\b/, code: 'MX' },
    { pattern: /\bchile\b|\bcl\b/, code: 'CL' },
    { pattern: /\bcolombia\b|\bco\b/, code: 'CO' },
    { pattern: /\bperu\b|\bperú\b|\bpe\b/, code: 'PE' },
    { pattern: /\beua\b|\bestados unidos\b|\busa\b|\bus\b/, code: 'US' },
  ];
  return countries.find((item) => item.pattern.test(normalized))?.code || fallbackCountry;
}

export function detectGenderFromPrompt(normalized: string): CampaignGender | null {
  if (/(feminino|mulher|mulheres)/i.test(normalized)) return 'FEMALE';
  if (/(masculino|homem|homens)/i.test(normalized)) return 'MALE';
  return null;
}

export function detectSpecialCategoryFromPrompt(normalized: string): string | null {
  if (/(imovel|imovel|casa|apartamento|housing|moradia)/i.test(normalized)) return 'Habitação';
  if (/(credito|crédito|financiamento|emprestimo|empréstimo)/i.test(normalized)) return 'Crédito';
  if (/(vaga|emprego|recrutamento)/i.test(normalized)) return 'Emprego';
  return null;
}

export function detectPlacementsFromPrompt(
  normalized: string,
  fallbackPlacements: CampaignPlacement[],
): CampaignPlacement[] {
  const placements: CampaignPlacement[] = [];
  if (/(feed)/i.test(normalized)) placements.push('feed');
  if (/(stories|story)/i.test(normalized)) placements.push('stories');
  if (/(reels|reel)/i.test(normalized)) placements.push('reels');
  if (/(explore|explorar)/i.test(normalized)) placements.push('explore');
  if (/(messenger)/i.test(normalized)) placements.push('messenger');
  if (/(audience network|rede de audiencia|rede de audiência)/i.test(normalized)) placements.push('audience_network');
  return placements.length ? placements : fallbackPlacements;
}

export function detectWeekDaysFromPrompt(normalized: string): string[] {
  const mapping: Array<{ pattern: RegExp; code: string }> = [
    { pattern: /segunda/, code: 'Mon' },
    { pattern: /terca|terça/, code: 'Tue' },
    { pattern: /quarta/, code: 'Wed' },
    { pattern: /quinta/, code: 'Thu' },
    { pattern: /sexta/, code: 'Fri' },
    { pattern: /sabado|sábado/, code: 'Sat' },
    { pattern: /domingo/, code: 'Sun' },
  ];
  const detected = mapping.filter((item) => item.pattern.test(normalized)).map((item) => item.code);
  if (/segunda a sexta/i.test(normalized)) return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  return detected;
}

export function detectOptimizationGoalFromPrompt(normalized: string): string | null {
  if (/(lead|cadastro)/i.test(normalized)) return 'Leads';
  if (/(compra|purchase|venda)/i.test(normalized)) return 'Conversions';
  if (/(alcance|impress)/i.test(normalized)) return 'Reach';
  if (/(clique|trafego|tráfego|visita)/i.test(normalized)) return 'Link clicks';
  return null;
}

export function detectBillingEventFromPrompt(normalized: string): string | null {
  if (/(clique|click)/i.test(normalized)) return 'Clicks';
  if (/(impress)/i.test(normalized)) return 'Impressions';
  return null;
}

export function detectConversionWindowFromPrompt(normalized: string): string | null {
  if (/1 dia|1-day/i.test(normalized)) return '1-day click';
  if (/7 dias|7-day/i.test(normalized)) return '7-day click';
  if (/view/i.test(normalized)) return '1-day view';
  return null;
}

export function detectPrimaryLanguageFromPrompt(normalized: string): string | null {
  if (/(ingles|inglês|english)/i.test(normalized)) return 'Inglês';
  if (/(espanhol|spanish)/i.test(normalized)) return 'Espanhol';
  if (/(portugues|português)/i.test(normalized)) return 'Português';
  return null;
}

export function detectCityFromPrompt(prompt: string, normalized: string): string | null {
  const promptLower = prompt.toLowerCase();

  if (/\bsp capital\b|\bsao paulo capital\b|\bsão paulo capital\b|\bcapital paulista\b/.test(promptLower)) {
    return 'São Paulo';
  }

  const cityPatterns: Array<{ pattern: RegExp; value: string }> = [
    { pattern: /\bbelo horizonte\b/, value: 'Belo Horizonte' },
    { pattern: /\bporto alegre\b/, value: 'Porto Alegre' },
    { pattern: /\brio de janeiro\b/, value: 'Rio de Janeiro' },
    { pattern: /\bcuritiba\b/, value: 'Curitiba' },
    { pattern: /\bflorianopolis\b|\bflorianópolis\b/, value: 'Florianópolis' },
    { pattern: /\bbrasilia\b|\bbrasília\b/, value: 'Brasília' },
    { pattern: /\bgoiania\b|\bgoiânia\b/, value: 'Goiânia' },
    { pattern: /\bsalvador\b/, value: 'Salvador' },
    { pattern: /\brecife\b/, value: 'Recife' },
    { pattern: /\bfortaleza\b/, value: 'Fortaleza' },
    { pattern: /\bsao paulo\b|\bsão paulo\b/, value: 'São Paulo' },
  ];

  return cityPatterns.find((item) => item.pattern.test(normalized))?.value || null;
}

export function detectRegionFromPrompt(prompt: string, normalized: string): string | null {
  const promptUpper = prompt.toUpperCase();

  const statePatterns: Array<{ abbr: RegExp; name: RegExp; value: string }> = [
    { abbr: /\bAC\b/, name: /\bacre\b/, value: 'Acre' },
    { abbr: /\bAL\b/, name: /\balagoas\b/, value: 'Alagoas' },
    { abbr: /\bAM\b/, name: /\bamazonas\b/, value: 'Amazonas' },
    { abbr: /\bAP\b/, name: /\bamapa\b|\bamapá\b/, value: 'Amapá' },
    { abbr: /\bBA\b/, name: /\bbahia\b/, value: 'Bahia' },
    { abbr: /\bCE\b/, name: /\bceara\b|\bceará\b/, value: 'Ceará' },
    { abbr: /\bDF\b/, name: /\bdistrito federal\b/, value: 'Distrito Federal' },
    { abbr: /\bES\b/, name: /\bespirito santo\b|\bespírito santo\b/, value: 'Espírito Santo' },
    { abbr: /\bGO\b/, name: /\bgoias\b|\bgoiás\b/, value: 'Goiás' },
    { abbr: /\bMA\b/, name: /\bmaranhao\b|\bmaranhão\b/, value: 'Maranhão' },
    { abbr: /\bMG\b/, name: /\bminas gerais\b/, value: 'Minas Gerais' },
    { abbr: /\bMS\b/, name: /\bmato grosso do sul\b/, value: 'Mato Grosso do Sul' },
    { abbr: /\bMT\b/, name: /\bmato grosso\b/, value: 'Mato Grosso' },
    { abbr: /\bPA\b/, name: /\bpará\b/, value: 'Pará' },
    { abbr: /\bPB\b/, name: /\bparaiba\b|\bparaíba\b/, value: 'Paraíba' },
    { abbr: /\bPE\b/, name: /\bpernambuco\b/, value: 'Pernambuco' },
    { abbr: /\bPI\b/, name: /\bpiaui\b|\bpiauí\b/, value: 'Piauí' },
    { abbr: /\bPR\b/, name: /\bparana\b|\bparaná\b/, value: 'Paraná' },
    { abbr: /\bRJ\b/, name: /\brio de janeiro\b/, value: 'Rio de Janeiro' },
    { abbr: /\bRN\b/, name: /\brio grande do norte\b/, value: 'Rio Grande do Norte' },
    { abbr: /\bRO\b/, name: /\brondonia\b|\brondônia\b/, value: 'Rondônia' },
    { abbr: /\bRR\b/, name: /\broraima\b/, value: 'Roraima' },
    { abbr: /\bRS\b/, name: /\brio grande do sul\b/, value: 'Rio Grande do Sul' },
    { abbr: /\bSC\b/, name: /\bsanta catarina\b/, value: 'Santa Catarina' },
    { abbr: /\bSE\b/, name: /\bsergipe\b/, value: 'Sergipe' },
    { abbr: /\bSP\b/, name: /\bsao paulo\b|\bsão paulo\b/, value: 'São Paulo' },
    { abbr: /\bTO\b/, name: /\btocantins\b/, value: 'Tocantins' },
  ];

  return statePatterns.find((item) => item.abbr.test(promptUpper) || item.name.test(normalized))?.value || null;
}

export function normalizeDetectedCity(value: string): string | null {
  const cleaned = value
    .replace(/[,.]+$/g, '')
    .trim();

  if (!cleaned) return null;
  if (/^[A-Z]{2}$/i.test(cleaned)) return null;

  const normalized = normalizePromptText(cleaned);
  if (/(clinica|clínica|odontologica|odontológica|campanha|leads?|implante|estetica|estética)/i.test(normalized)) {
    return null;
  }

  return toPromptTitleCase(cleaned);
}

export function detectInterestFallbackFromPrompt(normalized: string): string {
  if (/(moda|roupa|vestuario|vestuário|beleza)/i.test(normalized)) return 'moda feminina, compras online, beleza, lookalike de compradores';
  if (/(imovel|casa|apartamento|moradia)/i.test(normalized)) return 'imóveis, financiamento, intenção de compra de imóvel';
  if (/(clinica|clínica|saude|saúde|estetica|estética)/i.test(normalized)) return 'saúde, estética, bem-estar, agendamento';
  if (/(curso|educacao|educação|mentoria)/i.test(normalized)) return 'educação online, cursos, desenvolvimento profissional';
  return 'compras online, intenção de compra, remarketing';
}

export function buildAiHeadlineForState(
  destinationType: CampaignDestinationType,
  objective: CampaignObjective,
): string {
  if (destinationType === 'messages') return 'Fale com a nossa equipe e avance agora';
  if (objective === 'OUTCOME_LEADS') return 'Peça sua proposta e receba atendimento rápido';
  if (objective === 'REACH') return 'Descubra a marca certa para o seu momento';
  return 'Conheça a oferta certa para seguir adiante';
}

export function buildAiDescriptionForObjective(selectedObjectiveLabel: string): string {
  return `${selectedObjectiveLabel} com leitura clara de público, oferta e próximo passo.`;
}

export function buildAiMessageForState(params: {
  city: string;
  region: string;
  country: string;
  destinationType: CampaignDestinationType;
  selectedObjectiveLabel: string;
}): string {
  const place = params.city.trim() || params.region.trim() || params.country.trim().toUpperCase();
  if (params.destinationType === 'messages') {
    return `Campanha criada para gerar conversas qualificadas em ${place}, com mensagem direta, CTA forte e foco em resposta rápida.`;
  }

  return `Campanha criada para ${params.selectedObjectiveLabel.toLowerCase()} em ${place}, com foco em clareza de oferta, público aderente e avanço até o destino final.`;
}

export function defaultEventForObjective(objective: CampaignObjective): string {
  if (objective === 'OUTCOME_LEADS') return 'Lead';
  if (objective === 'REACH') return 'ViewContent';
  return 'PageView';
}
