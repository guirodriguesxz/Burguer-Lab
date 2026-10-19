import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Role } from '@prisma/client'
import { ROLES_KEY } from './roles.decorator'
import { SessionService } from './session.service'

/** Valida o JWT (Bearer) contra o banco e, se a rota declarar @Roles, exige um dos papéis informados (RBAC). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest()
    const token = (req.headers.authorization as string | undefined)?.replace(/^Bearer /, '')
    if (!token) throw new UnauthorizedException('Token ausente')

    const user = await this.sessions.verify(token)
    if (!user) throw new UnauthorizedException('Sessão inválida ou expirada')

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()])
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('Sem permissão')

    req.user = user
    return true
  }
}
