import { BadGatewayException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { IbgeService } from './ibge.service';

describe('IbgeService', () => {
  function createService() {
    const httpService = {
      get: jest.fn(),
    };
    const logger = {
      warn: jest.fn(),
    };

    const service = new IbgeService(httpService as any, logger as any);
    return { service, httpService, logger };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns states ordered alphabetically and simplified', async () => {
    const { service, httpService } = createService();
    httpService.get.mockReturnValue(of({
      data: [
        { id: 35, nome: 'São Paulo', sigla: 'SP' },
        { id: 41, nome: 'Paraná', sigla: 'PR' },
      ],
    }));

    await expect(service.getStates()).resolves.toEqual([
      { code: 'PR', name: 'Paraná', ibgeId: 41 },
      { code: 'SP', name: 'São Paulo', ibgeId: 35 },
    ]);
  });

  it('returns cities by uf ordered alphabetically', async () => {
    const { service, httpService } = createService();
    httpService.get.mockReturnValue(of({
      data: [
        { id: 4106902, nome: 'Curitiba' },
        { id: 4108304, nome: 'Foz do Iguaçu' },
      ],
    }));

    await expect(service.getCitiesByUf('pr')).resolves.toEqual([
      { id: 4106902, name: 'Curitiba' },
      { id: 4108304, name: 'Foz do Iguaçu' },
    ]);
  });

  it('rejects invalid uf', async () => {
    const { service } = createService();

    await expect(service.getCitiesByUf('parana')).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'UF inválida. Use a sigla com 2 letras, como PR ou SP.',
      }),
    });
  });

  it('uses cache to avoid repeated state calls', async () => {
    const { service, httpService } = createService();
    httpService.get.mockReturnValue(of({
      data: [{ id: 41, nome: 'Paraná', sigla: 'PR' }],
    }));

    await service.getStates();
    await service.getStates();

    expect(httpService.get).toHaveBeenCalledTimes(1);
  });

  it('rejects ibge failures with friendly state error', async () => {
    const { service, httpService } = createService();
    httpService.get.mockReturnValue(throwError(() => new Error('timeout')));

    await expect(service.getStates()).rejects.toBeInstanceOf(BadGatewayException);
    await expect(service.getStates()).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'Não foi possível consultar os estados no IBGE no momento.',
      }),
    });
  });

  it('validates city and state consistency using cityId', async () => {
    const { service, httpService } = createService();
    httpService.get.mockReturnValue(of({
      data: [{ id: 4106902, nome: 'Curitiba' }],
    }));

    await expect(service.validateCityForState('PR', 4106902, 'Curitiba')).resolves.toBe(true);
    await expect(service.validateCityForState('PR', 4106902, 'Londrina')).resolves.toBe(false);
  });
});
