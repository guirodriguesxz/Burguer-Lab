import { SetMetadata } from '@nestjs/common'
import { Role } from '@prisma/client'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)

/** Conteúdo do JWT. `tv` é a versão do token: trocar a senha a incrementa e invalida os tokens antigos. */
export interface AuthUser {
  sub: string
  role: Role
  name: string
  tv: number
  /** Identificador único do token: permite encerrar uma sessão específica (logout). */
  jti?: string
  /** Expiração (segundos desde 1970), preenchida pelo JWT. */
  exp?: number
}

/** Usuário da requisição autenticada: o JWT mais os dados atuais do banco. */
export interface SessionUser extends AuthUser {
  email: string
}
