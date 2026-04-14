import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(private readonly configService: ConfigService) {}

  getIntegrationStatus() {
    const token = this.configService.get<string>('META_ACCESS_TOKEN');
    return {
      provider: 'Meta',
      connected: !!token,
      lastSync: null,
      details: token ? 'Token de integração configurado' : 'Nenhum token configurado',
    };
  }

  async syncAdAccounts() {
    this.logger.log('Iniciando sincronização de ad accounts com a Meta API');
    // Placeholder de integração. Implementar chamada real à Meta Graph API aqui.
    return {
      synced: 0,
      message: 'Sincronização de ad accounts ainda não implementada',
    };
  }
}
