import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { z } from 'zod'
import { AuthGuard } from '../auth/auth.guard'
import { AuthService } from '../auth/auth.service'
import { checkPassword } from '../auth/password-policy'
import { AuthUser, Roles } from '../auth/roles.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'

const roleSchema = z.enum(['ADMIN', 'KITCHEN', 'CASHIER'])

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  role: roleSchema,
  password: z.string().max(200),
})

const updateSchema = z
  .object({ name: z.string().trim().min(2).max(80), role: roleSchema, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nenhum campo para atualizar')

const publicFields = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const

/** Gestão de usuários (somente ADMIN). */
@Controller('admin/users')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get()
  list() {
    return this.prisma.user.findMany({ select: publicFields, orderBy: [{ active: 'desc' }, { name: 'asc' }] })
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten())
    const { name, role, password } = parsed.data
    const email = parsed.data.email.toLowerCase()

    const policy = checkPassword(password, email)
    if (!policy.ok) throw new BadRequestException(policy.reason)
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Já existe um usuário com esse e-mail')

    return this.prisma.user.create({
      data: { name, email, role, passwordHash: await bcrypt.hash(password, 10) },
      select: publicFields,
    })
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() req: { user: AuthUser }) {
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten())
    const target = await this.prisma.user.findUnique({ where: { id } })
    if (!target) throw new NotFoundException('Usuário não encontrado')

    const { role, active } = parsed.data
    const losesAdmin = target.role === 'ADMIN' && target.active && ((role && role !== 'ADMIN') || active === false)
    const changesAccess = (role !== undefined && role !== target.role) || active === false

    if (id === req.user.sub && changesAccess) {
      throw new ConflictException('Você não pode alterar o seu próprio acesso. Peça a outro administrador.')
    }
    if (losesAdmin) {
      const others = await this.prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } })
      if (others === 0) throw new ConflictException('É preciso manter ao menos um administrador ativo')
    }

    const updated = await this.prisma.user.update({
      where: { id },
      // mudar papel ou desativar derruba as sessões abertas do usuário
      data: { ...parsed.data, ...(changesAccess ? { tokenVersion: { increment: 1 } } : {}) },
      select: publicFields,
    })
    if (changesAccess) this.realtime.disconnectUser(id) // inclusive as conexões em tempo real já abertas
    return updated
  }

  /** Envia ao usuário o link de redefinição de senha (mesmo fluxo do "esqueci minha senha"). */
  @Post(':id/send-reset')
  @HttpCode(200)
  async sendReset(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) throw new NotFoundException('Usuário não encontrado')
    await this.auth.requestPasswordReset(user.email)
    return { ok: true }
  }
}
