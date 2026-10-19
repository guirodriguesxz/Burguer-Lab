import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface AuditActor {
  id?: string
  email?: string
}

export interface AuditEntry {
  entity?: string
  entityId?: string
  /** Só identificadores e campos alterados. Nunca senhas, tokens nem dados de clientes. */
  meta?: Record<string, unknown>
  ip?: string
}

/** Requisição mínima de que a auditoria precisa (o usuário já autenticado e o IP). */
export interface AuditReq {
  user?: { sub: string; email?: string }
  ip?: string
}

export const actorOf = (req: AuditReq): AuditActor => ({ id: req.user?.sub, email: req.user?.email })

/** Campos que mudaram entre dois objetos, no formato { campo: { de, para } }. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>): Record<string, { de: unknown; para: unknown }> {
  const out: Record<string, { de: unknown; para: unknown }> = {}
  for (const key of Object.keys(after)) {
    const a = JSON.stringify(before[key])
    const b = JSON.stringify(after[key])
    if (a !== b) out[key] = { de: before[key], para: after[key] }
  }
  return out
}

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AuditService.name)
  private timer?: NodeJS.Timeout

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => this.purge().catch((e) => this.log.error(e)), 6 * 60 * 60 * 1000)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  /**
   * Registra uma ação. Falha de auditoria nunca derruba a operação principal (só vai para o log):
   * mas como a gravação é aguardada, uma ação concluída tem seu registro persistido antes da resposta.
   */
  async record(actor: AuditActor | null, action: string, entry: AuditEntry = {}) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: actor?.id,
          actorEmail: actor?.email,
          action,
          entity: entry.entity,
          entityId: entry.entityId,
          meta: entry.meta === undefined ? undefined : (entry.meta as Prisma.InputJsonValue),
          ip: entry.ip,
        },
      })
    } catch (e) {
      this.log.error(`Falha ao registrar auditoria (${action}): ${e instanceof Error ? e.message : e}`)
    }
  }

  /** Apaga registros mais antigos que AUDIT_RETENTION_DAYS (padrão 365). */
  purge(now = new Date()) {
    const days = Number(process.env.AUDIT_RETENTION_DAYS ?? 365)
    return this.prisma.auditLog.deleteMany({ where: { at: { lt: new Date(now.getTime() - days * 24 * 60 * 60 * 1000) } } })
  }
}
