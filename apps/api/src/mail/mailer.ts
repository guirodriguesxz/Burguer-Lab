import { Injectable, Logger } from '@nestjs/common'

export interface Mail {
  to: string
  subject: string
  text: string
}

/** Contrato de envio de e-mail; trocar de provedor é implementar esta classe. */
export abstract class Mailer {
  abstract send(mail: Mail): Promise<void>
}

/** Sem provedor configurado: o e-mail vai para o log (útil em desenvolvimento e em demos). */
@Injectable()
export class ConsoleMailer extends Mailer {
  private readonly log = new Logger('Mailer')
  async send(mail: Mail) {
    this.log.warn(`E-mail para ${mail.to} (RESEND_API_KEY não configurada, mostrando aqui)\n${mail.subject}\n${mail.text}`)
  }
}

/** Envio real via Resend (https://resend.com), sem dependência extra: só HTTPS. */
@Injectable()
export class ResendMailer extends Mailer {
  private readonly log = new Logger('Mailer')
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {
    super()
  }

  async send(mail: Mail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) this.log.error(`Resend recusou o envio (HTTP ${res.status})`)
  }
}
