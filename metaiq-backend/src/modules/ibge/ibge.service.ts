import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../../common/services/logger.service';

export interface IbgeStateDto {
  code: string;
  name: string;
  ibgeId: number;
}

export interface IbgeCityDto {
  id: number;
  name: string;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface IbgeStateApiResponse {
  id: number;
  nome: string;
  sigla: string;
}

interface IbgeCityApiResponse {
  id: number;
  nome: string;
}

@Injectable()
export class IbgeService {
  private readonly baseUrl = 'https://servicodados.ibge.gov.br/api/v1/localidades';
  private readonly cacheTtlMs = 24 * 60 * 60 * 1000;
  private statesCache: CacheEntry<IbgeStateDto[]> | null = null;
  private readonly citiesCache = new Map<string, CacheEntry<IbgeCityDto[]>>();

  constructor(
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {}

  async getStates(): Promise<IbgeStateDto[]> {
    const cached = this.readCache(this.statesCache);
    if (cached) {
      return cached;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<IbgeStateApiResponse[]>(`${this.baseUrl}/estados`),
      );
      const states = response.data
        .map((state) => ({
          code: state.sigla.trim().toUpperCase(),
          name: state.nome.trim(),
          ibgeId: state.id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      this.statesCache = this.createCacheEntry(states);
      return states;
    } catch (error) {
      this.logger.warn('IBGE states request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new BadGatewayException('Não foi possível consultar os estados no IBGE no momento.');
    }
  }

  async getCitiesByUf(ufInput: string): Promise<IbgeCityDto[]> {
    const uf = this.assertValidUf(ufInput);
    const cached = this.readCache(this.citiesCache.get(uf));
    if (cached) {
      return cached;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<IbgeCityApiResponse[]>(`${this.baseUrl}/estados/${uf}/municipios`),
      );
      const cities = response.data
        .map((city) => ({
          id: city.id,
          name: city.nome.trim(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      this.citiesCache.set(uf, this.createCacheEntry(cities));
      return cities;
    } catch (error) {
      this.logger.warn('IBGE cities request failed', {
        uf,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new BadGatewayException(`Não foi possível consultar as cidades de ${uf} no IBGE no momento.`);
    }
  }

  async validateCityForState(ufInput: string, cityId: number, cityName?: string | null): Promise<boolean> {
    const cities = await this.getCitiesByUf(ufInput);
    const normalizedCityName = (cityName || '').trim().toLowerCase();

    return cities.some((city) => city.id === cityId && (!normalizedCityName || city.name.trim().toLowerCase() === normalizedCityName));
  }

  assertValidUf(ufInput: string): string {
    const uf = (ufInput || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf)) {
      throw new BadRequestException('UF inválida. Use a sigla com 2 letras, como PR ou SP.');
    }
    return uf;
  }

  private readCache<T>(entry?: CacheEntry<T> | null): T | null {
    if (!entry || entry.expiresAt <= Date.now()) {
      return null;
    }
    return entry.data;
  }

  private createCacheEntry<T>(data: T): CacheEntry<T> {
    return {
      data,
      expiresAt: Date.now() + this.cacheTtlMs,
    };
  }
}
