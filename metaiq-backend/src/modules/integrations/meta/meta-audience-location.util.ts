import { BadRequestException } from '@nestjs/common';
import { CreateMetaCampaignDto } from './dto/meta-integration.dto';

export interface NormalizedCampaignLocation {
  country: string;
  state: string | null;
  stateName: string | null;
  city: string | null;
  cityId: number | null;
  region: string | null;
  metaCityKey: string | null;
}

export interface MetaGeoLocationShape {
  countries: string[];
  regions?: Array<{ key: string }>;
  cities?: Array<{ name: string; country: string }>;
}

export function normalizeCampaignLocation(dto: CreateMetaCampaignDto): NormalizedCampaignLocation {
  const country = (dto.country || '').trim().toUpperCase();
  const state = (dto.state || '').trim().toUpperCase() || null;
  const stateName = (dto.stateName || '').trim() || null;
  const legacyRegion = normalizeOptionalText((dto as CreateMetaCampaignDto & { region?: string }).region);
  const city = normalizeOptionalText(dto.city);
  const cityId = dto.cityId ? Number(dto.cityId) : null;

  if (!country) {
    throw new BadRequestException('country é obrigatório para criar audiência geográfica.');
  }

  if (city && !state) {
    throw new BadRequestException('Cidade informada sem estado. Use a seleção geográfica padronizada.');
  }

  if (cityId && !city) {
    throw new BadRequestException('cityId informado sem city correspondente.');
  }

  if (state && !/^[A-Z]{2}$/.test(state)) {
    throw new BadRequestException('Localização inconsistente no payload da campanha.');
  }

  if (legacyRegion && stateName && !sameText(legacyRegion, stateName)) {
    throw new BadRequestException('Localização inconsistente no payload da campanha.');
  }

  if (legacyRegion && city && !state && !looksLikeStateCodeOrName(legacyRegion)) {
    throw new BadRequestException('Cidade informada sem estado. Use a seleção geográfica padronizada.');
  }

  const resolvedStateName = stateName || (legacyRegion && !city ? legacyRegion : legacyRegion && state ? legacyRegion : null);

  return sanitizeLocation({
    country,
    state,
    stateName: resolvedStateName,
    city,
    cityId,
    region: legacyRegion,
    metaCityKey: null,
  });
}

export function buildMetaGeoLocations(location: NormalizedCampaignLocation): MetaGeoLocationShape {
  const geoLocations: MetaGeoLocationShape = {
    countries: [location.country],
  };

  if (location.city) {
    geoLocations.cities = [
      {
        name: location.city,
        country: location.country,
      },
    ];
    return sanitizeGeoLocations(geoLocations);
  }

  return sanitizeGeoLocations(geoLocations);
}

function sanitizeLocation(location: NormalizedCampaignLocation): NormalizedCampaignLocation {
  return {
    country: location.country,
    state: location.state || null,
    stateName: location.stateName || null,
    city: location.city || null,
    cityId: location.cityId || null,
    region: location.region || null,
    metaCityKey: location.metaCityKey || null,
  };
}

function sanitizeGeoLocations(geoLocations: MetaGeoLocationShape): MetaGeoLocationShape {
  return Object.fromEntries(
    Object.entries(geoLocations).filter(([, value]) => {
      if (value == null) return false;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    }),
  ) as MetaGeoLocationShape;
}

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = (value || '').trim();
  return normalized || null;
}

function sameText(left: string, right: string): boolean {
  return normalizeComparable(left) === normalizeComparable(right);
}

function looksLikeStateCodeOrName(value: string): boolean {
  const trimmed = value.trim();
  return /^[A-Z]{2}$/i.test(trimmed) || trimmed.length >= 3;
}

function normalizeComparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
