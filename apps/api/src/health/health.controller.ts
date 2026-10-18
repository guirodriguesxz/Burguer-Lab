import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Usado pelo healthcheck do container e pelo orquestrador: só responde 200 se o banco responde. */
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
    } catch {
      throw new ServiceUnavailableException('database unavailable')
    }
    return { status: 'ok' }
  }
}
