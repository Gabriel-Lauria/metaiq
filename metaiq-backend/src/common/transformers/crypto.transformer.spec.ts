import { CryptoTransformer } from './crypto.transformer';
import { encrypt } from '../crypto.util';

describe('CryptoTransformer', () => {
  let transformer: CryptoTransformer;

  beforeEach(() => {
    transformer = new CryptoTransformer();
  });

  describe('to() - Encriptação (Para o banco)', () => {
    it('deve encriptar um valor string válido', () => {
      const token = 'test-meta-access-token-12345';
      const encrypted = transformer.to(token);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(token); // Certifica que foi encriptado
      expect(encrypted).toContain(':'); // Deve ter formato "iv:encrypted"
    });

    it('deve retornar null para valor null', () => {
      const result = transformer.to(null);
      expect(result).toBeNull();
    });

    it('deve retornar null para valor undefined', () => {
      const result = transformer.to(undefined);
      expect(result).toBeNull();
    });

    it('deve retornar null para string vazia', () => {
      const result = transformer.to('');
      expect(result).toBeNull();
    });
  });

  describe('from() - Descriptografia (Do banco)', () => {
    it('deve decriptar um valor encriptado corretamente', () => {
      const originalToken = 'my-meta-api-token-xyz';
      const encrypted = encrypt(originalToken);

      const decrypted = transformer.from(encrypted);

      expect(decrypted).toBe(originalToken);
    });

    it('deve retornar null para valor null', () => {
      const result = transformer.from(null);
      expect(result).toBeNull();
    });

    it('deve retornar null para valor undefined', () => {
      const result = transformer.from(undefined);
      expect(result).toBeNull();
    });

    it('deve lançar erro para valor inválido/corrompido', () => {
      const invalidEncrypted = 'invalid-hex:invalid-encrypted';

      expect(() => transformer.from(invalidEncrypted)).toThrow();
    });
  });

  describe('Ciclo completo to() → from()', () => {
    it('deve recuperar o valor original após to() → from()', () => {
      const originalToken = 'eyjhbgcioijsiuzisinr5cci6IkpXVCJ9...';

      const encrypted = transformer.to(originalToken);
      const decrypted = transformer.from(encrypted);

      expect(decrypted).toBe(originalToken);
    });

    it('deve produzir diferentes encriptações para o mesmo valor', () => {
      const token = 'test-token-123';

      const encrypted1 = transformer.to(token);
      const encrypted2 = transformer.to(token);

      // Devido ao IV aleatório, as encriptações devem ser diferentes
      expect(encrypted1).not.toBe(encrypted2);

      // Mas ambas devem decriptar para o mesmo valor
      expect(transformer.from(encrypted1)).toBe(token);
      expect(transformer.from(encrypted2)).toBe(token);
    });
  });
});
