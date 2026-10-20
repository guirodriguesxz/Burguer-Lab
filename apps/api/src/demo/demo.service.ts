import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { isDemoMode } from './demo'

/** Estoque mínimo que a demonstração mantém: sem isso, os visitantes esgotam itens (o Brownie tem 3) e a vitrine fica vazia. */
export const DEMO_MIN_STOCK = 20

@Injectable()
export class DemoService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DemoService.name)
  private timer?: NodeJS.Timeout

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (!isDemoMode()) return
    void this.restock().catch((e) => this.log.error(e))
    this.timer = setInterval(() => this.restock().catch((e) => this.log.error(e)), 15 * 60 * 1000)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  /** Repõe só o que estiver abaixo do mínimo; produtos sem controle de estoque (null) ficam como estão. */
  async restock() {
    const { count } = await this.prisma.product.updateMany({
      where: { stock: { not: null, lt: DEMO_MIN_STOCK } },
      data: { stock: DEMO_MIN_STOCK },
    })
    return count
  }
}
