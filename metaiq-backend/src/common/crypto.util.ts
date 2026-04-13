import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

/**
 * Criptografa string com AES-256-CBC
 */
export function encrypt(text: string, cryptoSecret?: string): string {
  const key = Buffer.from(cryptoSecret || process.env.CRYPTO_SECRET || 'default-key-32-characters-minimum', 'utf-8');
  const key256 = crypto.createHash('sha256').update(key).digest(); // Garantir 32 bytes

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key256, iv);

  let encrypted = cipher.update(text, 'utf-8', 'hex');
  encrypted += cipher.final('hex');

  // Retorna IV + encrypted (IV é necessário para descriptografar)
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Descriptografa string criptografada
 */
export function decrypt(encrypted: string, cryptoSecret?: string): string {
  const key = Buffer.from(cryptoSecret || process.env.CRYPTO_SECRET || 'default-key-32-characters-minimum', 'utf-8');
  const key256 = crypto.createHash('sha256').update(key).digest();

  const [ivHex, encryptedHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key256, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}
