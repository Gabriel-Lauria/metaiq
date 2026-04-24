import { buildMetaCreativePayload, isLikelyDirectImageUrl, sanitizeMetaPayload, validateMetaCreativePayload } from './meta-creative.validation';

describe('meta-creative.validation', () => {
  it('monta um creative minimo estavel com fallback de headline e sem description vazia', () => {
    const payload = buildMetaCreativePayload({
      campaignName: 'Campanha de Consultoria Premium',
      pageId: '123456',
      destinationUrl: 'https://metaiq.dev/oferta',
      message: '  Conheca a oferta principal  ',
      headline: '   ',
      description: '   ',
      imageHash: 'meta-image-hash-1',
      cta: 'Saiba mais',
    });

    const objectStorySpec = JSON.parse(payload.object_story_spec);

    expect(objectStorySpec.page_id).toBe('123456');
    expect(objectStorySpec.link_data.link).toBe('https://metaiq.dev/oferta');
    expect(objectStorySpec.link_data.message).toBe('Conheca a oferta principal');
    expect(objectStorySpec.link_data.name).toBe('Campanha de Consultoria Premium');
    expect(objectStorySpec.link_data.image_hash).toBe('meta-image-hash-1');
    expect(objectStorySpec.link_data.call_to_action.type).toBe('LEARN_MORE');
    expect(objectStorySpec.link_data).not.toHaveProperty('description');
  });

  it('usa image_url quando image_hash ainda nao existir', () => {
    const payload = buildMetaCreativePayload({
      campaignName: 'Campanha de Consultoria Premium',
      pageId: '123456',
      destinationUrl: 'https://metaiq.dev/oferta',
      message: 'Mensagem valida',
      headline: 'Headline valida',
      description: '',
      imageUrl: 'https://cdn.metaiq.dev/oferta.jpg',
      cta: 'LEARN_MORE',
    });

    const objectStorySpec = JSON.parse(payload.object_story_spec);

    expect(objectStorySpec.link_data.image_url).toBe('https://cdn.metaiq.dev/oferta.jpg');
    expect(objectStorySpec.link_data).not.toHaveProperty('image_hash');
  });

  it('bloqueia payload sem pageId, destination https ou imagem', () => {
    expect(() => validateMetaCreativePayload({
      campaignName: 'Campanha',
      pageId: '',
      destinationUrl: 'https://metaiq.dev/oferta',
      message: 'Mensagem valida',
      imageUrl: 'https://cdn.metaiq.dev/imagem.jpg',
    })).toThrow('pageId é obrigatório');

    expect(() => validateMetaCreativePayload({
      campaignName: 'Campanha',
      pageId: '123456',
      destinationUrl: 'http://metaiq.dev/oferta',
      message: 'Mensagem valida',
      headline: 'Headline',
      imageUrl: 'https://cdn.metaiq.dev/imagem.jpg',
    })).toThrow('destinationUrl válido com https é obrigatório');

    expect(() => validateMetaCreativePayload({
      campaignName: 'Campanha',
      pageId: '123456',
      destinationUrl: 'https://metaiq.dev/oferta',
      message: 'Mensagem valida',
      headline: 'Headline',
      imageHash: '',
      imageUrl: '',
    })).toThrow('imageUrl é obrigatório para creative com imagem.');
  });

  it('bloqueia message vazia e carousel sem suporte real', () => {
    expect(() => validateMetaCreativePayload({
      campaignName: 'Campanha',
      pageId: '123456',
      destinationUrl: 'https://metaiq.dev/oferta',
      message: '   ',
      imageHash: 'meta-image-hash-1',
    })).toThrow('message é obrigatório');

    expect(() => validateMetaCreativePayload({
      campaignName: 'Campanha',
      pageId: '123456',
      destinationUrl: 'https://metaiq.dev/oferta',
      message: 'Mensagem valida',
      imageHash: 'meta-image-hash-1',
      carousel: true,
    })).toThrow('carousel ainda não está suportado');
  });

  it('mantem heuristica conservadora para imagem direta', () => {
    expect(isLikelyDirectImageUrl('https://cdn.metaiq.dev/uploads/criativo')).toBe(true);
    expect(isLikelyDirectImageUrl('https://metaiq.dev/preview/oferta.html')).toBe(false);
  });

  it('sanitiza campos vazios e preserva mapping correto para link_data', () => {
    const payload = buildMetaCreativePayload({
      campaignName: 'Campanha',
      pageId: '1043259782209836',
      destinationUrl: 'https://www.metaiq.com.br',
      message: 'Mensagem principal',
      headline: 'Pet shop com mais confiança',
      description: '',
      imageUrl: 'https://cdn.metaiq.dev/petshop.jpg',
      cta: 'LEARN_MORE',
    });
    const objectStorySpec = JSON.parse(payload.object_story_spec);

    expect(objectStorySpec.page_id).toBe('1043259782209836');
    expect(objectStorySpec.link_data.name).toBe('Pet shop com mais confiança');
    expect(objectStorySpec.link_data.call_to_action.type).toBe('LEARN_MORE');
    expect(objectStorySpec.link_data.call_to_action.value.link).toBe('https://www.metaiq.com.br');
    expect(objectStorySpec.link_data).not.toHaveProperty('description');
  });

  it('remove undefined, null e string vazia do payload', () => {
    expect(sanitizeMetaPayload({
      a: 'valor',
      b: '',
      c: undefined,
      d: null,
      e: { keep: 'ok', drop: '' },
    })).toEqual({
      a: 'valor',
      e: { keep: 'ok' },
    });
  });
});
