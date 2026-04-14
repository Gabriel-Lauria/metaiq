import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const LEGACY_ALGORITHM = 'aes-256-cbc';
const GCM_PREFIX = 'gcm';

function getKey(cryptoSecret?: string): Buffer {
  const secret = cryptoSecret || process.env.CRYPTO_SECRET || 'default-key-32-characters-minimum';
  return crypto.createHash('sha256').update(secret, 'utf-8').digest();
}

/**
 * Criptografa string com AES-256-GCM.
 */
export function encrypt(text: string, cryptoSecret?: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(cryptoSecret), iv);

  let encrypted = cipher.update(text, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return [GCM_PREFIX, iv.toString('hex'), authTag, encrypted].join(':');
}

/**
 * Descriptografa string criptografada
 */
export function decrypt(encrypted: string, cryptoSecret?: string): string {
  const parts = encrypted.split(':');
  const key = getKey(cryptoSecret);

  if (parts[0] === GCM_PREFIX) {
    const [, ivHex, authTagHex, encryptedHex] = parts;
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
  }

  const [ivHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}
