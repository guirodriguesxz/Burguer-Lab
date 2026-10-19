import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { z } from 'zod'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'

const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) })
const forgotSchema = z.object({ email: z.string().email().max(254) })
const resetSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().max(200) })

const loginLimit = () => Number(process.env.LOGIN_RATE_LIMIT ?? 5)
const changeSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().max(200) })

const resetLimit = () => Number(process.env.RESET_RATE_LIMIT ?? 5)

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Freia tentativa de adivinhar senha: por padrão 5 tentativas por minuto por IP.
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: loginLimit(), ttl: 60_000 } })
  login(@Body() body: unknown) {
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('E-mail ou senha inválidos')
    return this.auth.login(parsed.data.email, parsed.data.password)
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
  async reset(@Body() body: unknown) {
    const parsed = resetSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Link inválido ou expirado. Peça um novo.')
    await this.auth.resetPassword(parsed.data.token, parsed.data.password)
    return { ok: true }
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: loginLimit(), ttl: 60_000 } })
  changePassword(@Body() body: unknown, @Req() req: { user: { sub: string } }) {
    const parsed = changeSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Informe a senha atual e a nova senha')
    return this.auth.changePassword(req.user.sub, parsed.data.currentPassword, parsed.data.newPassword)
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: { user: unknown }) {
    return req.user
  }
}
