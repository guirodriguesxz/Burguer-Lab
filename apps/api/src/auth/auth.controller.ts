import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { z } from 'zod'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Freia tentativa de adivinhar senha: por padrão 5 tentativas por minuto por IP.
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: Number(process.env.LOGIN_RATE_LIMIT ?? 5), ttl: 60_000 } })
  login(@Body() body: unknown) {
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('E-mail ou senha inválidos')
    return this.auth.login(parsed.data.email, parsed.data.password)
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: { user: unknown }) {
    return req.user
  }
}
