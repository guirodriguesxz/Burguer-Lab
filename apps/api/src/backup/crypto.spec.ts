import { BackupCryptoError, decryptBackup, encryptBackup } from './crypto'

const pass = 'uma-senha-longa-de-backup'

describe('criptografia do backup', () => {
  it('cifra e decifra, e o arquivo não contém o texto original', () => {
    const plain = Buffer.from('maria@loja.com;hash-da-senha;203.0.113.9')
    const blob = encryptBackup(plain, pass)
    expect(blob.toString('latin1')).not.toContain('maria@loja.com')
    expect(blob.subarray(0, 5).toString()).toBe('BLBK1')
    expect(decryptBackup(blob, pass).equals(plain)).toBe(true)
  })

  it('cada cifragem é diferente (sal e iv aleatórios), mas todas decifram', () => {
    const plain = Buffer.from('igual')
    const a = encryptBackup(plain, pass)
    const b = encryptBackup(plain, pass)
    expect(a.equals(b)).toBe(false)
    expect(decryptBackup(a, pass).equals(plain)).toBe(true)
    expect(decryptBackup(b, pass).equals(plain)).toBe(true)
  })

  it('recusa senha errada, arquivo adulterado e arquivo truncado', () => {
    const blob = encryptBackup(Buffer.from('dados importantes'), pass)
    expect(() => decryptBackup(blob, 'outra-senha-bem-longa-123')).toThrow(BackupCryptoError)

    const tampered = Buffer.from(blob)
    tampered[tampered.length - 20] ^= 0xff // vira um bit no meio do conteúdo
    expect(() => decryptBackup(tampered, pass)).toThrow('corrompido')

    expect(() => decryptBackup(blob.subarray(0, blob.length - 5), pass)).toThrow(BackupCryptoError)
    expect(() => decryptBackup(Buffer.from('isto não é um backup'), pass)).toThrow('inválido')
  })

  it('exige uma senha longa o bastante', () => {
    expect(() => encryptBackup(Buffer.from('x'), 'curta')).toThrow('ao menos 16')
  })
})
