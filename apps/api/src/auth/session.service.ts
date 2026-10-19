import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { AuthUser, SessionUser } from './roles.decorator'

/**
 * Valida um JWT e confere no banco se a sessão continua válida: usuário existente e ativo, versão do token
 * atual e token não encerrado no logout. Assim, trocar a senha ou desativar o usuário derruba as sessões
 * antigas, e o papel (role) vale o do banco, não o do token.
 */
@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SessionService.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    // Tokens encerrados só precisam ser lembrados até expirarem sozinhos.
    this.timer = setInterval(() => this.purgeRevoked().catch((e) => this.log.error(e)), 60 * 60 * 1000)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  async verify(token: string): Promise<SessionUser | null> {
    let payload: AuthUser
    try {
      payload = await this.jwt.verifyAsync<AuthUser>(token)
    } catch {
      return null
    }
    const [user, revoked] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, email: true, role: true, tokenVersion: true, active: true },
      }),
      payload.jti ? this.prisma.revokedToken.findUnique({ where: { jti: payload.jti } }) : null,
    ])
    if (!user || !user.active || user.tokenVersion !== payload.tv || revoked) return null
    return { sub: user.id, name: user.name, email: user.email, role: user.role, tv: user.tokenVersion, jti: payload.jti, exp: payload.exp }
  }

  /** Encerra esta sessão específica (logout), sem afetar as outras telas da mesma pessoa. */
  async revoke(token: string) {
    let payload: AuthUser
    try {
      payload = await this.jwt.verifyAsync<AuthUser>(token)
    } catch {
      return // token inválido ou já expirado: nada a encerrar
    }
    if (!payload.jti || !payload.exp) return
    await this.prisma.revokedToken.upsert({
      where: { jti: payload.jti },
      update: {},
      create: { jti: payload.jti, expiresAt: new Date(payload.exp * 1000) },
    })
  }

  purgeRevoked(now = new Date()) {
    return this.prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: now } } })
  }
}
