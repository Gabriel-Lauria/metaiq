import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { IbgeController } from './ibge.controller';
import { IbgeService } from './ibge.service';

describe('IbgeController', () => {
  let app: INestApplication;

  const ibgeService = {
    getStates: jest.fn().mockResolvedValue([
      { code: 'PR', name: 'Parana', ibgeId: 41 },
    ]),
    getCitiesByUf: jest.fn().mockResolvedValue([
      { id: 4106902, name: 'Curitiba' },
    ]),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [IbgeController],
      providers: [
        { provide: IbgeService, useValue: ibgeService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns states without requiring a token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/ibge/states')
      .expect(200);

    expect(response.body).toEqual([
      { code: 'PR', name: 'Parana', ibgeId: 41 },
    ]);
    expect(ibgeService.getStates).toHaveBeenCalled();
  });

  it('returns cities for a state without requiring a token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/ibge/states/pr/cities')
      .expect(200);

    expect(response.body).toEqual([
      { id: 4106902, name: 'Curitiba' },
    ]);
    expect(ibgeService.getCitiesByUf).toHaveBeenCalledWith('pr');
  });
});
