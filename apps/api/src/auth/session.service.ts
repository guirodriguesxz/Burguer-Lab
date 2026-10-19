import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { AuthUser } from './roles.decorator'

/**
 * Valida um JWT e confere no banco se a sessão continua válida: usuário existente e versão do token
 * atual. Assim, trocar a senha derruba as sessões antigas e o papel (role) vale o do banco, não o do token.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async verify(token: string): Promise<AuthUser | null> {
    let payload: AuthUser
    try {
      payload = await this.jwt.verifyAsync<AuthUser>(token)
    } catch {
      return null
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, role: true, tokenVersion: true },
    })
    if (!user || user.tokenVersion !== payload.tv) return null
    return { sub: user.id, name: user.name, role: user.role, tv: user.tokenVersion }
  }
}
