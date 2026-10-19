import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { actorOf, AuditService } from '../audit/audit.service'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { clearSessionCookie, setSessionCookie } from './cookies'
import { SessionService } from './session.service'
import { SessionUser } from './roles.decorator'

const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) })
const forgotSchema = z.object({ email: z.string().email().max(254) })
const resetSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().max(200) })
const changeSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().max(200) })

const loginLimit = () => Number(process.env.LOGIN_RATE_LIMIT ?? 5)
const resetLimit = () => Number(process.env.RESET_RATE_LIMIT ?? 5)

type AuthedRequest = Request & { user: SessionUser; sessionToken: string }

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Login: a sessão vai num cookie HttpOnly (o JavaScript da página nunca vê o token). A resposta só traz
   * os dados do usuário. Clientes de API que precisam do token podem lê-lo do Set-Cookie.
   */
  // Freia tentativa de adivinhar senha: por padrão 5 tentativas por minuto por IP.
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: loginLimit(), ttl: 60_000 } })
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('E-mail ou senha inválidos')

    let result
    try {
      result = await this.auth.login(parsed.data.email, parsed.data.password)
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        await this.audit.record(null, 'auth.login_failed', { meta: { email: parsed.data.email.toLowerCase().slice(0, 254) }, ip: req.ip })
      }
      throw e
    }
    setSessionCookie(res, result.token)
    await this.audit.record({ id: result.user.id, email: result.user.email }, 'auth.login', { entity: 'User', entityId: result.user.id, ip: req.ip })
    return { user: result.user }
  }

  /** Encerra só esta sessão (o token fica na lista de revogados até expirar) e limpa o cookie. */
  @Post('logout')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(req.sessionToken)
    clearSessionCookie(res)
    await this.audit.record(actorOf(req), 'auth.logout', { entity: 'User', entityId: req.user.sub, ip: req.ip })
    return { ok: true }
  }

  /** Resposta idêntica exista o e-mail ou não (não revela quem tem conta). */
  @Post('forgot-password')
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: resetLimit(), ttl: 60_000 } })
  async forgot(@Body() body: unknown) {
    const parsed = forgotSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Informe um e-mail válido')
    await this.auth.requestPasswordReset(parsed.data.email)
    return { ok: true, message: 'Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha.' }
  }

  @Post('reset-password')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: resetLimit(), ttl: 60_000 } })
  async reset(@Body() body: unknown, @Req() req: Request) {
    const parsed = resetSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Link inválido ou expirado. Peça um novo.')
    const user = await this.auth.resetPassword(parsed.data.token, parsed.data.password)
    await this.audit.record({ id: user.id, email: user.email }, 'auth.password_reset', { entity: 'User', entityId: user.id, ip: req.ip })
    return { ok: true }
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: loginLimit(), ttl: 60_000 } })
  async changePassword(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const parsed = changeSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Informe a senha atual e a nova senha')
    const { token } = await this.auth.changePassword(req.user.sub, parsed.data.currentPassword, parsed.data.newPassword, req.user.jti)
    setSessionCookie(res, token) // esta tela continua logada com a sessão nova; as demais caíram
    await this.audit.record(actorOf(req), 'auth.password_changed', { entity: 'User', entityId: req.user.sub, ip: req.ip })
    return { ok: true }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: AuthedRequest) {
    const { sub, name, email, role } = req.user
    return { id: sub, name, email, role }
  }
}
