import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
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
