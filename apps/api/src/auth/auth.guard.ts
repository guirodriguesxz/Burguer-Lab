import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Role } from '@prisma/client'
import { AuthUser, ROLES_KEY } from './roles.decorator'

/** Valida o JWT (Bearer) e, se a rota declarar @Roles, exige um dos papéis informados (RBAC). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest()
    const token = (req.headers.authorization as string | undefined)?.replace(/^Bearer /, '')
    if (!token) throw new UnauthorizedException('Token ausente')

    let user: AuthUser
    try {
      user = await this.jwt.verifyAsync<AuthUser>(token)
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado')
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()])
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('Sem permissão')

    req.user = user
    return true
  }
}
