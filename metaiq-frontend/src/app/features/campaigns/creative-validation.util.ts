export function isValidHttpUrl(value: string): boolean {
  const trimmed = (value || '').trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isSecureHttpUrl(value: string): boolean {
  const trimmed = (value || '').trim();
  if (!trimmed) return false;

  try {
    return new URL(trimmed).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isLikelyDirectImageUrl(value: string): boolean {
  const trimmed = (value || '').trim();
  if (!isValidHttpUrl(trimmed)) return false;

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (['google.com', 'www.google.com', 'l.facebook.com', 'lm.facebook.com'].includes(hostname)) {
      return false;
    }

    if (/(?:^|\/)(imgres|redirect|redir)(?:\/|$)/i.test(pathname)) {
      return false;
    }

    if (/\.(?:html?|php|aspx?)$/i.test(pathname)) {
      return false;
    }

    if (/\.(?:avif|gif|jpe?g|png|webp)$/i.test(pathname)) {
      return true;
    }

    const format = parsed.searchParams.get('format')
      || parsed.searchParams.get('fm')
      || parsed.searchParams.get('ext');
    if (format && /^(avif|gif|jpe?g|png|webp)$/i.test(format)) {
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

export function normalizeCreativeText(value: string | null | undefined): string {
  return (value || '').trim();
}
