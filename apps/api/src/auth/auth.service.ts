import { createHash, randomBytes } from 'node:crypto'
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { Mailer } from '../mail/mailer'
import { PrismaService } from '../prisma/prisma.service'
import { checkPassword } from './password-policy'
import { AuthUser } from './roles.decorator'

const RESET_TTL_MS = 30 * 60 * 1000
/** Teto de pedidos de redefinição por e-mail por hora (evita encher a caixa de entrada de alguém). */
const RESET_MAX_PER_HOUR = 3

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** Hash "descartável" para gastar o mesmo tempo quando o e-mail não existe (evita revelar contas pelo tempo de resposta). */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10)

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailer: Mailer,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
    // Mesma mensagem para e-mail inexistente e senha errada, para não revelar quais e-mails existem.
    if (!user || !valid) throw new UnauthorizedException('E-mail ou senha incorretos')

    const payload: AuthUser = { sub: user.id, role: user.role, name: user.name, tv: user.tokenVersion }
    return {
      token: await this.jwt.signAsync(payload),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    }
  }

  /**
   * Inicia a redefinição. A resposta é sempre a mesma, exista o e-mail ou não. O token é aleatório
   * (256 bits), só o hash é guardado, expira em 30 minutos e vale uma única vez.
   */
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (!user) return

    const since = new Date(Date.now() - 60 * 60 * 1000)
    const recent = await this.prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gte: since } } })
    if (recent >= RESET_MAX_PER_HOUR) return

    const token = randomBytes(32).toString('hex')
    await this.prisma.$transaction([
      // só o pedido mais recente vale
      this.prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      }),
    ])

    const base = (process.env.ADMIN_URL ?? 'http://localhost:5174/').replace(/\/?$/, '/')
    const link = `${base}?reset=${token}`
    // Sem await: o tempo de resposta não pode denunciar se o e-mail existe.
    this.mailer
      .send({
        to: user.email,
        subject: 'Burger Lab: redefinição de senha',
        text: `Olá, ${user.name}.\n\nPara criar uma nova senha, acesse (vale por 30 minutos e funciona uma vez):\n${link}\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.`,
      })
      .catch((e) => this.log.error(`Falha ao enviar e-mail de redefinição: ${e instanceof Error ? e.message : e}`))
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    })
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException('Link inválido ou expirado. Peça um novo.')
    }

    const policy = checkPassword(newPassword, record.user.email)
    if (!policy.ok) throw new BadRequestException(policy.reason)

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await this.prisma.$transaction(async (tx) => {
      // Consome o token de forma atômica: dois cliques simultâneos no mesmo link, só um vence.
      const claim = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } })
      if (claim.count === 0) throw new BadRequestException('Link inválido ou expirado. Peça um novo.')
      // tokenVersion + 1 derruba todas as sessões abertas com a senha antiga.
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } })
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } })
    })
  }
}
