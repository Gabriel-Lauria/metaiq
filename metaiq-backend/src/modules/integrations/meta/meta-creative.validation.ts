import { BadRequestException } from '@nestjs/common';
import { DEFAULT_META_CTA, normalizeMetaCtaType, type MetaCallToActionType } from './meta-cta.constants';

const IMAGE_EXTENSION_PATTERN = /\.(avif|gif|jpe?g|png|webp)$/i;
const IMAGE_FORMAT_PATTERN = /^(avif|gif|jpe?g|png|webp)$/i;
const BLOCKED_IMAGE_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'tbn0.gstatic.com',
  'tbn1.gstatic.com',
  'tbn2.gstatic.com',
  'tbn3.gstatic.com',
  'encrypted-tbn0.gstatic.com',
  'encrypted-tbn1.gstatic.com',
  'encrypted-tbn2.gstatic.com',
  'encrypted-tbn3.gstatic.com',
  'l.facebook.com',
  'lm.facebook.com',
]);
const BLOCKED_IMAGE_PATH_PATTERN = /(?:^|\/)(imgres|redirect|redir)(?:\/|$)/i;
const HTML_PATH_PATTERN = /\.(?:html?|php|aspx?)$/i;

export interface MetaCreativeValidationInput {
  campaignName: string;
  pageId: string;
  destinationUrl: string;
  message: string;
  headline?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  imageHash?: string | null;
  cta?: string | null;
  carousel?: boolean;
}

export interface ValidatedMetaCreativePayload {
  pageId: string;
  destinationUrl: string;
  message: string;
  headline: string;
  description?: string;
  imageUrl?: string;
  imageHash: string;
  ctaType: MetaCallToActionType;
}

export function isValidMetaHttpUrl(value: string | null | undefined): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidMetaHttpsUrl(value: string | null | undefined): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;

  try {
    return new URL(trimmed).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isLikelyDirectImageUrl(value: string | null | undefined): boolean {
  const trimmed = String(value || '').trim();
  if (!isValidMetaHttpUrl(trimmed)) return false;

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (BLOCKED_IMAGE_HOSTS.has(hostname)) {
      return false;
    }

    if (BLOCKED_IMAGE_PATH_PATTERN.test(pathname) || HTML_PATH_PATTERN.test(pathname)) {
      return false;
    }

    if (pathname.includes('/preview/') || pathname.includes('/redirect/')) {
      return false;
    }

    if (IMAGE_EXTENSION_PATTERN.test(pathname)) {
      return true;
    }

    const format = parsed.searchParams.get('format')
      || parsed.searchParams.get('fm')
      || parsed.searchParams.get('ext');
    if (format && IMAGE_FORMAT_PATTERN.test(format)) {
      return true;
    }

    if (pathname.includes('/image') || pathname.includes('/images/') || pathname.includes('/media/') || pathname.includes('/uploads/')) {
      return true;
    }

    return !parsed.searchParams.has('url');
  } catch {
    return false;
  }
}

export function validateMetaCreativePayload(input: MetaCreativeValidationInput): ValidatedMetaCreativePayload {
  const campaignName = input.campaignName.trim();
  const pageId = input.pageId.trim();
  const destinationUrl = input.destinationUrl.trim();
  const message = input.message.trim();
  const headline = normalizeHeadline(input.headline, campaignName);
  const description = normalizeOptionalText(input.description);
  const imageUrl = normalizeOptionalText(input.imageUrl);
  const imageHash = String(input.imageHash || '').trim();
  const ctaType = normalizeMetaCtaType(input.cta, DEFAULT_META_CTA);

  if (!pageId) {
    throw new BadRequestException('pageId é obrigatório para montar o creative da Meta');
  }

  if (!message) {
    throw new BadRequestException('message é obrigatório para montar o creative da Meta');
  }

  if (!isValidMetaHttpsUrl(destinationUrl)) {
    throw new BadRequestException('destinationUrl válido com https é obrigatório para campanhas de tráfego para site.');
  }

  if (!imageHash && !imageUrl) {
    throw new BadRequestException('imageUrl é obrigatório para creative com imagem.');
  }

  if (imageUrl && !isValidMetaHttpUrl(imageUrl)) {
    throw new BadRequestException('imageUrl deve ser uma URL http(s) válida para o creative da Meta.');
  }

  if (input.carousel) {
    throw new BadRequestException('carousel ainda não está suportado no payload real da Meta sem child_attachments');
  }

  return {
    pageId,
    destinationUrl,
    message,
    headline,
    description,
    imageUrl,
    imageHash,
    ctaType,
  };
}

export function buildMetaCreativePayload(input: MetaCreativeValidationInput): Record<string, string> {
  const validated = validateMetaCreativePayload(input);
  const linkData = sanitizeMetaPayload({
    link: validated.destinationUrl,
    message: validated.message,
    name: validated.headline,
    description: validated.description,
    image_hash: validated.imageHash || undefined,
    image_url: !validated.imageHash ? validated.imageUrl : undefined,
    call_to_action: {
      type: validated.ctaType,
      value: {
        link: validated.destinationUrl,
      },
    },
  }) as Record<string, unknown>;

  return {
    name: input.campaignName.trim(),
    object_story_spec: JSON.stringify({
      page_id: validated.pageId,
      link_data: linkData,
    }),
  };
}

export function sanitizeMetaPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeMetaPayload(item))
      .filter((item) => item !== undefined && item !== null) as T;
  }

  if (value && typeof value === 'object') {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, sanitizeMetaPayload(item)] as const)
      .filter(([, item]) => item !== undefined && item !== null && item !== '');

    return Object.fromEntries(sanitizedEntries) as T;
  }

  return value;
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const trimmed = String(value || '').trim();
  return trimmed || undefined;
}

function normalizeHeadline(headline: string | null | undefined, campaignName: string): string {
  const explicitHeadline = normalizeOptionalText(headline);
  if (explicitHeadline) {
    return explicitHeadline.slice(0, 80);
  }

  const fallback = campaignName.trim().slice(0, 40);
  return fallback || 'Saiba mais';
}
