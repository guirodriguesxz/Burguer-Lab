import { Global, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ThrottlerModule } from '@nestjs/throttler'
import { requireSecret } from '../config'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { SessionService } from './session.service'

@Global()
@Module({
  imports: [
    // Limite por IP; as rotas sensíveis aplicam limites próprios mais estritos.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.RATE_LIMIT ?? 120) }]),
    JwtModule.register({
      global: true,
      secret: requireSecret('JWT_SECRET', 'dev-only-secret-change-me'),
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, SessionService],
  exports: [AuthGuard, SessionService],
})
export class AuthModule {}
