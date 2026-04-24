export const META_CTA_TYPES = [
  'LEARN_MORE',
  'SHOP_NOW',
  'CONTACT_US',
  'BOOK_NOW',
  'SIGN_UP',
  'DOWNLOAD',
  'GET_OFFER',
  'MESSAGE_PAGE',
  'OPEN_APP',
  'INSTALL_APP',
  'APPLY_NOW',
] as const;

export type MetaCallToActionType = (typeof META_CTA_TYPES)[number];

export const DEFAULT_META_CTA: MetaCallToActionType = 'LEARN_MORE';

const META_CTA_TYPE_SET = new Set<MetaCallToActionType>(META_CTA_TYPES);
const META_CTA_LABEL_ALIASES: Record<string, MetaCallToActionType> = {
  SAIBA_MAIS: 'LEARN_MORE',
  COMPRAR_AGORA: 'SHOP_NOW',
  FALE_CONOSCO: 'CONTACT_US',
  AGENDAR_AGORA: 'BOOK_NOW',
  CADASTRAR: 'SIGN_UP',
  CADASTRE_SE: 'SIGN_UP',
  INSCREVA_SE: 'SIGN_UP',
  BAIXAR: 'DOWNLOAD',
  VER_OFERTA: 'GET_OFFER',
  ENVIAR_MENSAGEM: 'MESSAGE_PAGE',
  ABRIR_APP: 'OPEN_APP',
  INSTALAR_APP: 'INSTALL_APP',
  CANDIDATAR_SE: 'APPLY_NOW',
  APLICAR_AGORA: 'APPLY_NOW',
};

function normalizeMetaCtaKey(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export function parseMetaCtaType(value: string | null | undefined): MetaCallToActionType | undefined {
  if (!value) return undefined;

  const normalizedKey = normalizeMetaCtaKey(value);
  if (!normalizedKey) return undefined;

  if (META_CTA_TYPE_SET.has(normalizedKey as MetaCallToActionType)) {
    return normalizedKey as MetaCallToActionType;
  }

  return META_CTA_LABEL_ALIASES[normalizedKey];
}

export function normalizeMetaCtaType(
  value: string | null | undefined,
  fallback: MetaCallToActionType = DEFAULT_META_CTA,
): MetaCallToActionType {
  return parseMetaCtaType(value) || fallback;
}

export function transformMetaCtaInput(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return parseMetaCtaType(trimmed) || trimmed;
}
