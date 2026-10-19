import { Injectable } from '@nestjs/common'
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client'

/**
 * Métricas no formato Prometheus. Usa um registro próprio (não o global), então vários apps na mesma
 * instância de teste não colidem. Os rótulos são sempre de baixa cardinalidade (rota por padrão de URL,
 * nunca com ids) e nunca contêm dados de pessoas.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry()

  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.3, 1, 3, 10],
    registers: [this.registry],
  })

  readonly ordersCreated = new Counter({ name: 'orders_created_total', help: 'Pedidos criados', labelNames: ['method'], registers: [this.registry] })
  readonly paymentsConfirmed = new Counter({ name: 'payments_confirmed_total', help: 'Pagamentos confirmados', labelNames: ['method'], registers: [this.registry] })
  readonly paymentsExpired = new Counter({ name: 'payments_expired_total', help: 'Cobranças que expiraram sem pagamento', registers: [this.registry] })
  readonly refunds = new Counter({ name: 'refunds_total', help: 'Estornos', labelNames: ['result'], registers: [this.registry] })
  readonly logins = new Counter({ name: 'logins_total', help: 'Tentativas de login', labelNames: ['result'], registers: [this.registry] })
  readonly wsConnections = new Gauge({ name: 'websocket_connections', help: 'Conexões WebSocket abertas', registers: [this.registry] })

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'burgerlab_' })
  }
}
