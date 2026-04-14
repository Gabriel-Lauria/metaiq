import { ValueTransformer } from 'typeorm';
import { encrypt, decrypt } from '../crypto.util';

/**
 * ValueTransformer para TypeORM que encripta/decripta valores ao salvar/carregar
 * Uso:
 *   @Column({ transformer: new CryptoTransformer() })
 *   accessToken: string;
 */
export class CryptoTransformer implements ValueTransformer {
  /**
   * Chama encrypt() quando o valor é SALVO no banco
   * TypeORM chama esse método ANTES de executar database INSERT/UPDATE
   */
  to(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return encrypt(value);
    } catch (error) {
      console.error('[CryptoTransformer] Erro ao encriptar:', error);
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
      console.error('[CryptoTransformer] Erro ao decriptar:', error);
      throw error;
    }
  }
}
