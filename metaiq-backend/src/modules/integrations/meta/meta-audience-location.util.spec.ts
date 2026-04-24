import { buildMetaGeoLocations, normalizeCampaignLocation } from './meta-audience-location.util';

describe('meta audience location utils', () => {
  it('accepts complete location with country, state, city and cityId', () => {
    const location = normalizeCampaignLocation({
      country: 'BR',
      state: 'PR',
      stateName: 'Paraná',
      city: 'Curitiba',
      cityId: 4106902,
    } as any);

    expect(location).toEqual({
      country: 'BR',
      state: 'PR',
      stateName: 'Paraná',
      city: 'Curitiba',
      cityId: 4106902,
      region: null,
      metaCityKey: null,
    });
  });

  it('rejects city without state', () => {
    expect(() => normalizeCampaignLocation({
      country: 'BR',
      city: 'Curitiba',
    } as any)).toThrow('Cidade informada sem estado');
  });

  it('rejects cityId without city', () => {
    expect(() => normalizeCampaignLocation({
      country: 'BR',
      state: 'PR',
      cityId: 4106902,
    } as any)).toThrow('cityId informado sem city correspondente');
  });

  it('rejects missing country', () => {
    expect(() => normalizeCampaignLocation({
      state: 'PR',
      city: 'Curitiba',
      cityId: 4106902,
    } as any)).toThrow('country é obrigatório');
  });

  it('allows legacy region only when safe', () => {
    const location = normalizeCampaignLocation({
      country: 'BR',
      state: 'PR',
      region: 'Paraná',
    } as any);

    expect(location.stateName).toBe('Paraná');
  });

  it('rejects inconsistent legacy region payload', () => {
    expect(() => normalizeCampaignLocation({
      country: 'BR',
      state: 'ES',
      stateName: 'Espírito Santo',
      region: 'Espírito Santo',
      city: 'Curitiba',
      cityId: 4106902,
    } as any)).not.toThrow();

    expect(() => normalizeCampaignLocation({
      country: 'BR',
      state: 'PR',
      stateName: 'Paraná',
      region: 'Espírito Santo',
      city: 'Curitiba',
      cityId: 4106902,
    } as any)).toThrow('Localização inconsistente no payload da campanha.');
  });

  it('builds geo_locations with cities when city exists', () => {
    const geo = buildMetaGeoLocations({
      country: 'BR',
      state: 'PR',
      stateName: 'Paraná',
      city: 'Curitiba',
      cityId: 4106902,
      region: 'Paraná',
      metaCityKey: null,
    });

    expect(geo).toEqual({
      countries: ['BR'],
      cities: [{ name: 'Curitiba', country: 'BR' }],
    });
  });

  it('builds geo_locations with conservative fallback when only state exists', () => {
    const geo = buildMetaGeoLocations({
      country: 'BR',
      state: 'PR',
      stateName: 'Paraná',
      city: null,
      cityId: null,
      region: 'Paraná',
      metaCityKey: null,
    });

    expect(geo).toEqual({
      countries: ['BR'],
    });
  });

  it('builds geo_locations with only countries when only country exists', () => {
    const geo = buildMetaGeoLocations({
      country: 'BR',
      state: null,
      stateName: null,
      city: null,
      cityId: null,
      region: null,
      metaCityKey: null,
    });

    expect(geo).toEqual({
      countries: ['BR'],
    });
  });
});
