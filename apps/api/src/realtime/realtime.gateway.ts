import { Injectable } from '@nestjs/common'
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { SessionService } from '../auth/session.service'
import { parseCookies, SESSION_COOKIE } from '../auth/cookies'
import { corsOrigin } from '../cors'
import { MetricsService } from '../observability/metrics.service'

/**
 * Eventos em tempo real.
 * - Sala "staff" (cozinha/admin, exige JWT válido no handshake): order:created, order:updated
 * - Broadcast público: menu:changed (totem recarrega estoque/disponibilidade)
 */
@Injectable()
@WebSocketGateway({ cors: { origin: corsOrigin(), credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server

  constructor(
    private readonly sessions: SessionService,
    private readonly metrics: MetricsService,
  ) {}

  handleDisconnect() {
    this.metrics.wsConnections.dec()
  }

  async handleConnection(client: Socket) {
    this.metrics.wsConnections.inc()
    const fromAuth = client.handshake.auth?.token as string | undefined
    const fromCookie = parseCookies(client.handshake.headers.cookie)[SESSION_COOKIE]
    const token = fromAuth ?? fromCookie
    if (!token) return // conexão pública: só recebe eventos de broadcast

    // Sessão por cookie: confere de onde veio a conexão (o WebSocket não passa pelo CORS do navegador).
    if (!fromAuth && !this.originAllowed(client.handshake.headers.origin, client.handshake.headers.host)) {
      return client.disconnect(true)
    }
    const user = await this.sessions.verify(token)
    if (!user) return client.disconnect(true)
    client.data.userId = user.sub
    client.data.jti = user.jti
    if (user.role === 'ADMIN' || user.role === 'KITCHEN' || user.role === 'CASHIER') await client.join('staff')
  }

  /** Sem Origin (clientes que não são navegador) passa; com Origin, precisa ser do mesmo site ou estar permitido. */
  private originAllowed(origin: string | undefined, host: string | undefined) {
    if (!origin) return true
    const allowed = corsOrigin()
    if (allowed === true) return true
    try {
      if (new URL(origin).host === host) return true
    } catch {
      return false
    }
    return Array.isArray(allowed) && allowed.includes(origin)
  }

  /**
   * Encerra as conexões em tempo real de um usuário. Chamado quando as sessões dele são revogadas
   * (senha trocada, papel alterado, usuário desativado): sem isso, um socket já aberto continuaria
   * recebendo pedidos mesmo depois de o acesso ser cortado.
   */
  disconnectUser(userId: string, exceptJti?: string) {
    for (const socket of this.server.sockets.sockets.values()) {
      if (socket.data.userId !== userId) continue
      // Quem trocou a própria senha continua conectado nesta sessão (já recebe o cookie novo); só as outras caem.
      if (exceptJti && socket.data.jti === exceptJti) continue
      socket.disconnect(true)
    }
  }

  orderCreated(order: unknown) {
    this.server.to('staff').emit('order:created', order)
    this.queueChanged()
  }

  /** Pedido aguardando pagamento no caixa. */
  orderPending(order: unknown) {
    this.server.to('staff').emit('order:pending', order)
  }

  orderUpdated(order: unknown) {
    this.server.to('staff').emit('order:updated', order)
    this.queueChanged()
  }

  /** A tela de senhas (pública) recarrega a fila; o aviso não leva dados. */
  queueChanged() {
    this.server.emit('queue:changed')
  }

  menuChanged() {
    this.server.emit('menu:changed')
  }
}
