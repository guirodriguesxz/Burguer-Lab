import { Controller, Get } from '@nestjs/common'
import { demoLogins, isDemoMode } from './demo'

@Controller('demo')
export class DemoController {
  /** Diz ao totem e ao painel se estão em modo demonstração (e quais contas de teste mostrar). */
  @Get()
  info() {
    return { demo: isDemoMode(), logins: demoLogins() }
  }
}
