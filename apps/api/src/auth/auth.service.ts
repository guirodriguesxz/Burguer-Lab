import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { AuthUser } from './roles.decorator'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    // Mesma mensagem para e-mail inexistente e senha errada, para não revelar quais e-mails existem.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha incorretos')
    }
    const payload: AuthUser = { sub: user.id, role: user.role, name: user.name }
    return { token: await this.jwt.signAsync(payload), user: { id: user.id, name: user.name, email: user.email, role: user.role } }
  }
}
