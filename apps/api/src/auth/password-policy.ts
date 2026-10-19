/** O bcrypt só considera os primeiros 72 bytes: senhas maiores seriam truncadas em silêncio. */
export const PASSWORD_MAX = 72
export const PASSWORD_MIN = 10

export type PasswordCheck = { ok: true } | { ok: false; reason: string }

export function checkPassword(password: string, email?: string): PasswordCheck {
  if (password.length < PASSWORD_MIN) return { ok: false, reason: `A senha deve ter ao menos ${PASSWORD_MIN} caracteres` }
  if (Buffer.byteLength(password) > PASSWORD_MAX) return { ok: false, reason: `A senha deve ter no máximo ${PASSWORD_MAX} caracteres` }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return { ok: false, reason: 'A senha deve conter letras e números' }
  if (email && password.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) {
    return { ok: false, reason: 'A senha não pode conter o seu e-mail' }
  }
  return { ok: true }
}
