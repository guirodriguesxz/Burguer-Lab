import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const MAGIC = Buffer.from('BLBK1')
const SALT_LEN = 16
const IV_LEN = 12
const TAG_LEN = 16
export const MIN_PASSPHRASE_LENGTH = 16

export class BackupCryptoError extends Error {}

/** Senha → chave de 256 bits com scrypt (lento de propósito, para dificultar adivinhação por força bruta). */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 })
}

/**
 * Criptografa o backup com AES-256-GCM. O arquivo tem dados pessoais (e-mails, hashes de senha, IPs),
 * então nunca é gravado em texto puro. O GCM também autentica: qualquer alteração no arquivo é detectada.
 * Formato: "BLBK1" | salt(16) | iv(12) | texto cifrado | tag(16)
 */
export function encryptBackup(plain: Buffer, passphrase: string): Buffer {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new BackupCryptoError(`A senha do backup deve ter ao menos ${MIN_PASSPHRASE_LENGTH} caracteres`)
  }
  const salt = randomBytes(SALT_LEN)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([MAGIC, salt, iv, body, cipher.getAuthTag()])
}

export function decryptBackup(blob: Buffer, passphrase: string): Buffer {
  const minLength = MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN
  if (blob.length < minLength || !blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new BackupCryptoError('Arquivo de backup inválido ou de outro formato')
  }
  const salt = blob.subarray(MAGIC.length, MAGIC.length + SALT_LEN)
  const iv = blob.subarray(MAGIC.length + SALT_LEN, MAGIC.length + SALT_LEN + IV_LEN)
  const tag = blob.subarray(blob.length - TAG_LEN)
  const body = blob.subarray(MAGIC.length + SALT_LEN + IV_LEN, blob.length - TAG_LEN)

  const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(body), decipher.final()])
  } catch {
    // senha errada e arquivo adulterado/corrompido são indistinguíveis no GCM
    throw new BackupCryptoError('Senha incorreta ou arquivo de backup corrompido')
  }
}
