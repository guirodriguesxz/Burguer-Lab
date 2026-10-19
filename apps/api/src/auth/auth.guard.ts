import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Role } from '@prisma/client'
import { CSRF_HEADER_VALUE, readToken } from './cookies'
import { ROLES_KEY } from './roles.decorator'
import { SessionService } from './session.service'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Valida o JWT (cookie de sessão ou Bearer) contra o banco e, se a rota declarar @Roles, exige um dos papéis
 * informados (RBAC). Quando a sessão vem do cookie, requisições que alteram dados precisam do cabeçalho
 * X-Requested-With: um outro site não consegue enviá-lo sem permissão de CORS, o que fecha o CSRF
 * (além do SameSite=Strict do próprio cookie).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest()
    const found = readToken(req)
    if (!found) throw new UnauthorizedException('Token ausente')

    if (found.via === 'cookie' && !SAFE_METHODS.has(req.method) && req.headers['x-requested-with'] !== CSRF_HEADER_VALUE) {
      throw new ForbiddenException('Requisição bloqueada (proteção CSRF)')
    }

    const user = await this.sessions.verify(found.token)
    if (!user) throw new UnauthorizedException('Sessão inválida ou expirada')

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()])
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('Sem permissão')

    req.user = user
    req.sessionToken = found.token
    return true
  }
}
