import { ValueTransformer } from 'typeorm';
import { Logger } from '@nestjs/common';
import { encrypt, decrypt } from '../crypto.util';

/**
 * ValueTransformer para TypeORM que encripta/decripta valores ao salvar/carregar
 * Uso:
 *   @Column({ transformer: new CryptoTransformer() })
 *   accessToken: string;
 */
export class CryptoTransformer implements ValueTransformer {
  private readonly logger = new Logger(CryptoTransformer.name);

  /**
   * Chama encrypt() quando o valor é SALVO no banco
   * TypeORM chama esse método ANTES de executar database INSERT/UPDATE
   */
  to(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return encrypt(value);
    } catch (error) {
      this.logger.error('Erro ao encriptar valor protegido', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  /**
   * Chama decrypt() quando o valor é CARREGADO do banco
   * TypeORM chama esse método APÓS ler os dados da database
   */
  from(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return decrypt(value);
    } catch (error) {
      this.logger.error('Erro ao decriptar valor protegido', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }
}
