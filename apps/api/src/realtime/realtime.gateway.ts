import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { AuthUser } from '../auth/roles.decorator'

/**
 * Eventos em tempo real.
 * - Sala "staff" (cozinha/admin, exige JWT no handshake): order:created, order:updated
 * - Broadcast público: menu:changed (totem recarrega estoque/disponibilidade)
 */
@Injectable()
@WebSocketGateway({ cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined
    if (!token) return // conexão pública: só recebe eventos de broadcast
    try {
      const user = await this.jwt.verifyAsync<AuthUser>(token)
      if (user.role === 'ADMIN' || user.role === 'KITCHEN') await client.join('staff')
    } catch {
      client.disconnect(true)
    }
  }

  orderCreated(order: unknown) {
    this.server.to('staff').emit('order:created', order)
  }

  orderUpdated(order: unknown) {
    this.server.to('staff').emit('order:updated', order)
  }

  menuChanged() {
    this.server.emit('menu:changed')
  }
}
