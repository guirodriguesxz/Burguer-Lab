import { Injectable } from '@nestjs/common'
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { SessionService } from '../auth/session.service'
import { corsOrigin } from '../cors'

/**
 * Eventos em tempo real.
 * - Sala "staff" (cozinha/admin, exige JWT válido no handshake): order:created, order:updated
 * - Broadcast público: menu:changed (totem recarrega estoque/disponibilidade)
 */
@Injectable()
@WebSocketGateway({ cors: { origin: corsOrigin() } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server

  constructor(private readonly sessions: SessionService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined
    if (!token) return // conexão pública: só recebe eventos de broadcast
    const user = await this.sessions.verify(token)
    if (!user) return client.disconnect(true)
    if (user.role === 'ADMIN' || user.role === 'KITCHEN' || user.role === 'CASHIER') await client.join('staff')
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
