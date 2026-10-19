import { randomBytes } from 'node:crypto'
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard } from '../auth/auth.guard'
import { Roles } from '../auth/roles.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'

/** Texto sem acento, minúsculo e só com letras/números separados por "-" (usado nos ids). */
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'item'
const suffix = () => randomBytes(3).toString('hex')

const MAX_EXTRAS_PER_PRODUCT = 12

const productFields = {
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200),
  priceCents: z.number().int().min(1).max(1_000_000),
  emoji: z.string().trim().min(1).max(8),
  categoryId: z.string().min(1).max(64),
  /** null = estoque ilimitado */
  stock: z.number().int().min(0).max(1_000_000).nullable(),
  available: z.boolean(),
  removable: z
    .array(z.string().trim().min(1).max(40))
    .max(15)
    .refine((list) => new Set(list).size === list.length, 'Ingredientes repetidos'),
}

const createProductSchema = z.object({
  ...productFields,
  description: productFields.description.default(''),
  stock: productFields.stock.default(null),
  available: productFields.available.default(true),
  removable: productFields.removable.default([]),
})

const updateProductSchema = z
  .object(productFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nenhum campo para atualizar')

const extraFields = { name: z.string().trim().min(2).max(40), priceCents: z.number().int().min(0).max(100_000) }
const createExtraSchema = z.object(extraFields)
const updateExtraSchema = z.object(extraFields).partial().refine((v) => Object.keys(v).length > 0, 'Nenhum campo para atualizar')

const categoryFields = { label: z.string().trim().min(2).max(40), emoji: z.string().trim().min(1).max(8), position: z.number().int().min(0).max(999) }
const createCategorySchema = z.object({ ...categoryFields, position: categoryFields.position.default(99) })
const updateCategorySchema = z.object(categoryFields).partial().refine((v) => Object.keys(v).length > 0, 'Nenhum campo para atualizar')

const withExtras = { extras: { orderBy: { name: 'asc' as const } } }

/** Cadastro do cardápio: produtos, adicionais e categorias (somente ADMIN). Toda mudança avisa os totens em tempo real. */
@Controller('admin')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private bad(error: z.ZodError): never {
    throw new BadRequestException(error.flatten())
  }

  private async requireCategory(id: string) {
    if (!(await this.prisma.category.findUnique({ where: { id } }))) throw new BadRequestException('Categoria inexistente')
  }

  private async requireProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } })
    if (!product) throw new NotFoundException('Produto não encontrado')
    return product
  }

  // ---------- Produtos ----------

  @Get('products')
  products(@Query('archived') archived?: string) {
    return this.prisma.product.findMany({
      where: { archived: archived === 'true' },
      include: withExtras,
      orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
    })
  }

  @Post('products')
  async createProduct(@Body() body: unknown) {
    const parsed = createProductSchema.safeParse(body)
    if (!parsed.success) this.bad(parsed.error)
    await this.requireCategory(parsed.data.categoryId)
    const product = await this.prisma.product.create({
      data: { ...parsed.data, id: `${slug(parsed.data.name)}-${suffix()}` },
      include: withExtras,
    })
    this.realtime.menuChanged()
    return product
  }

  @Patch('products/:id')
  async updateProduct(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateProductSchema.safeParse(body)
    if (!parsed.success) this.bad(parsed.error)
    const current = await this.requireProduct(id)
    if (parsed.data.categoryId) await this.requireCategory(parsed.data.categoryId)
    if (current.archived && parsed.data.available) throw new ConflictException('Restaure o produto antes de ativá-lo')
    const product = await this.prisma.product.update({ where: { id }, data: parsed.data, include: withExtras })
    this.realtime.menuChanged()
    return product
  }

  /** "Excluir": arquiva. O produto some do cardápio e não pode mais ser vendido, mas continua no histórico. */
  @Delete('products/:id')
  async archiveProduct(@Param('id') id: string) {
    await this.requireProduct(id)
    const product = await this.prisma.product.update({ where: { id }, data: { archived: true, available: false }, include: withExtras })
    this.realtime.menuChanged()
    return product
  }

  /** Traz de volta um produto arquivado (volta pausado: ative-o quando quiser vender). */
  @Post('products/:id/restore')
  @HttpCode(200)
  async restoreProduct(@Param('id') id: string) {
    await this.requireProduct(id)
    const product = await this.prisma.product.update({ where: { id }, data: { archived: false }, include: withExtras })
    this.realtime.menuChanged()
    return product
  }

  // ---------- Adicionais ----------

  @Post('products/:id/extras')
  async createExtra(@Param('id') id: string, @Body() body: unknown) {
    const parsed = createExtraSchema.safeParse(body)
    if (!parsed.success) this.bad(parsed.error)
    const product = await this.requireProduct(id)
    if (product.archived) throw new ConflictException('Produto arquivado')
    const count = await this.prisma.extra.count({ where: { productId: id } })
    if (count >= MAX_EXTRAS_PER_PRODUCT) throw new ConflictException(`Limite de ${MAX_EXTRAS_PER_PRODUCT} adicionais por produto`)

    const extra = await this.prisma.extra.create({ data: { ...parsed.data, id: `${id}-${slug(parsed.data.name)}-${suffix()}`, productId: id } })
    this.realtime.menuChanged()
    return extra
  }

  @Patch('extras/:id')
  async updateExtra(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateExtraSchema.safeParse(body)
    if (!parsed.success) this.bad(parsed.error)
    if (!(await this.prisma.extra.findUnique({ where: { id } }))) throw new NotFoundException('Adicional não encontrado')
    const extra = await this.prisma.extra.update({ where: { id }, data: parsed.data })
    this.realtime.menuChanged()
    return extra
  }

  /** Pode excluir de vez: pedidos antigos guardam nome e preço do adicional no próprio item. */
  @Delete('extras/:id')
  @HttpCode(200)
  async deleteExtra(@Param('id') id: string) {
    if (!(await this.prisma.extra.findUnique({ where: { id } }))) throw new NotFoundException('Adicional não encontrado')
    await this.prisma.extra.delete({ where: { id } })
    this.realtime.menuChanged()
    return { ok: true }
  }

  // ---------- Categorias ----------

  @Get('categories')
  categories() {
    return this.prisma.category.findMany({ orderBy: { position: 'asc' } })
  }

  @Post('categories')
  async createCategory(@Body() body: unknown) {
    const parsed = createCategorySchema.safeParse(body)
    if (!parsed.success) this.bad(parsed.error)
    const category = await this.prisma.category.create({ data: { ...parsed.data, id: `${slug(parsed.data.label)}-${suffix()}` } })
    this.realtime.menuChanged()
    return category
  }

  @Patch('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateCategorySchema.safeParse(body)
    if (!parsed.success) this.bad(parsed.error)
    if (!(await this.prisma.category.findUnique({ where: { id } }))) throw new NotFoundException('Categoria não encontrada')
    const category = await this.prisma.category.update({ where: { id }, data: parsed.data })
    this.realtime.menuChanged()
    return category
  }

  @Delete('categories/:id')
  @HttpCode(200)
  async deleteCategory(@Param('id') id: string) {
    if (!(await this.prisma.category.findUnique({ where: { id } }))) throw new NotFoundException('Categoria não encontrada')
    if ((await this.prisma.product.count({ where: { categoryId: id } })) > 0) {
      throw new ConflictException('A categoria tem produtos (inclusive arquivados). Mova-os antes de excluir.')
    }
    await this.prisma.category.delete({ where: { id } })
    this.realtime.menuChanged()
    return { ok: true }
  }
}
