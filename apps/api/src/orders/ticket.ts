import { Prisma } from '@prisma/client'

const TZ = 'America/Sao_Paulo'

/** Dia de operação (AAAA-MM-DD) no fuso da loja: a virada da senha acontece à meia-noite de São Paulo, não do servidor. */
export function businessDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

/** Início do dia de operação (meia-noite em São Paulo, UTC-3; o Brasil não usa horário de verão desde 2019). */
export function businessDayStart(at: Date = new Date()): Date {
  return new Date(`${businessDate(at)}T00:00:00-03:00`)
}

/**
 * Próxima senha do dia. O INSERT ... ON CONFLICT ... RETURNING é atômico: pedidos simultâneos recebem
 * números distintos, e como roda dentro da transação do pedido, um pedido que falha não deixa buraco na sequência.
 */
export async function nextTicket(tx: Prisma.TransactionClient, at: Date = new Date()): Promise<number> {
  const date = businessDate(at)
  const rows = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO "DailyCounter" ("date", "last") VALUES (${date}, 1)
    ON CONFLICT ("date") DO UPDATE SET "last" = "DailyCounter"."last" + 1
    RETURNING "last"`
  return rows[0].last
}
