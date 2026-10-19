import { Global, Module } from '@nestjs/common'
import { ConsoleMailer, Mailer, ResendMailer } from './mailer'

@Global()
@Module({
  providers: [
    {
      provide: Mailer,
      useFactory: () =>
        process.env.RESEND_API_KEY && process.env.MAIL_FROM
          ? new ResendMailer(process.env.RESEND_API_KEY, process.env.MAIL_FROM)
          : new ConsoleMailer(),
    },
  ],
  exports: [Mailer],
})
export class MailModule {}
