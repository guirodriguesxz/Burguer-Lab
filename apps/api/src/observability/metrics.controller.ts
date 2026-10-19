import { timingSafeEqual } from 'node:crypto'
import { Controller, Get, Header, Headers, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { MetricsService } from './metrics.service'

const same = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Endpoint de métricas para o Prometheus. Desligado (404) a menos que METRICS_TOKEN esteja definido; quando
 * ligado, exige "Authorization: Bearer <METRICS_TOKEN>". Nunca fica aberto à internet por engano.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(@Headers('authorization') authorization?: string) {
    const token = process.env.METRICS_TOKEN
    if (!token) throw new NotFoundException()
    const given = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
    if (!same(given, token)) throw new UnauthorizedException()
    return this.metrics.registry.metrics()
  }
}
