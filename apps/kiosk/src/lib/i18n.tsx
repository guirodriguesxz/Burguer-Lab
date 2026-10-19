import { createContext, useContext, useMemo, type ReactNode } from 'react'

export type Lang = 'pt' | 'en'

const pt = {
  'welcome.subtitle': 'Faça seu pedido aqui, sem fila.',
  'welcome.ask': 'Onde você vai comer?',
  'welcome.dineIn': 'Comer aqui',
  'welcome.takeaway': 'Levar',
  'welcome.language': 'Idioma',
  'a11y.contrast': 'Alto contraste',
  'a11y.bigText': 'Texto maior',

  'menu.categories': 'Categorias',
  'menu.yourOrder': 'Seu pedido',
  'menu.empty': 'Toque em um item para adicionar.',
  'menu.total': 'Total ({n})',
  'menu.checkout': 'Ir para pagamento',
  'menu.cancel': 'Cancelar pedido',
  'menu.soldOut': 'Esgotado',
  'menu.decrease': 'Diminuir',
  'menu.increase': 'Aumentar',
  'menu.without': 'sem {x}',
  'menu.live.empty': 'Seu pedido está vazio',
  'menu.live.one': '1 item no pedido, total {total}',
  'menu.live.many': '{n} itens no pedido, total {total}',
  'menu.loading': 'Carregando cardápio…',
  'menu.noConnection': 'Sem conexão',
  'menu.loadFailed': 'Não foi possível carregar o cardápio.',
  'menu.back': 'Voltar',

  'custom.title': 'Personalizar {name}',
  'custom.remove': 'Remover ingredientes',
  'custom.without': 'Sem {x}',
  'custom.extras': 'Adicionais',
  'custom.back': 'Voltar',
  'custom.add': 'Adicionar · {price}',

  'upsell.title': 'Que tal completar seu pedido?',
  'upsell.aria': 'Sugestões para seu pedido',
  'upsell.drinks': 'Que tal uma bebida?',
  'upsell.sides': 'Acompanha uma porção?',
  'upsell.desserts': 'Fechar com uma sobremesa?',
  'upsell.add': 'Adicionar',
  'upsell.added': 'Adicionado ✓',
  'upsell.continue': 'Continuar para o pagamento',
  'upsell.no': 'Não, obrigado',

  'pay.title': 'Pagamento',
  'pay.dineIn': 'Para comer aqui',
  'pay.takeaway': 'Para levar',
  'pay.couponLabel': 'Cupom de desconto',
  'pay.apply': 'Aplicar',
  'pay.couponApplied': 'Cupom {code} aplicado: −{amount}',
  'pay.remove': 'remover',
  'pay.couponInvalid': 'Cupom inválido',
  'pay.couponExpired': 'Cupom expirado',
  'pay.couponExhausted': 'Cupom esgotado',
  'pay.couponMin': 'Pedido mínimo de {min} para este cupom',
  'pay.couponError': 'Não foi possível validar o cupom agora',
  'pay.subtotal': 'Subtotal {x}',
  'pay.totalLabel': 'Total',
  'pay.pix': 'Pix',
  'pay.card': 'Cartão',
  'pay.cash': 'No caixa',
  'pay.offline': 'Indisponível sem internet',
  'pay.cardHint': 'Aproxime ou insira o cartão na maquininha.',
  'pay.cardOffline': 'Sem internet: seu pedido será enviado assim que a conexão voltar.',
  'pay.cashHint': 'Você recebe uma senha e paga ao atendente no caixa. O pedido vai para a cozinha depois do pagamento.',
  'pay.back': 'Voltar ao cardápio',
  'pay.btn.pix': 'Gerar QR Code Pix',
  'pay.btn.card': 'Simular pagamento no cartão',
  'pay.btn.cash': 'Gerar senha e pagar no caixa',
  'pay.btn.choose': 'Escolha a forma de pagamento',
  'pay.processing': 'Processando…',
  'pay.pixScan': 'Escaneie com o app do seu banco · {amount}',
  'pay.pixExpires': 'Expira em {time} · aguardando pagamento…',
  'pay.pixQrAlt': 'QR Code Pix para pagamento',
  'pay.cancel': 'Cancelar',
  'pay.expired': 'O QR Code expirou e o pedido foi cancelado.',
  'pay.tryAgain': 'Tentar de novo',
  'pay.failed': 'Falha ao finalizar o pedido',
  'pay.noConnectionPix': 'Sem conexão. Tente o cartão ou chame um atendente.',

  'err.unavailable': 'Um item ficou indisponível. Volte e revise o pedido.',
  'err.invalid': 'Não foi possível processar o pedido. Revise os itens.',
  'err.slow': 'Muitas tentativas. Aguarde um instante.',
  'err.generic': 'Algo deu errado. Tente de novo ou chame um atendente.',

  'done.confirmed': 'Pedido confirmado!',
  'done.registered': 'Pedido registrado!',
  'done.cashNote': 'Dirija-se ao caixa e informe {what} abaixo para pagar. O pedido só vai para a cozinha depois do pagamento (você tem 15 minutos).',
  'done.theCode': 'o código',
  'done.theTicket': 'a senha',
  'done.offlineNote': 'Estamos sem conexão. Informe este código no balcão',
  'done.keep': 'Guarde sua senha e aguarde ser chamado',
  'done.code': 'CÓDIGO',
  'done.ticket': 'SENHA',
  'done.print': 'Imprimir senha',
  'done.new': 'Novo pedido ({n}s)',

  'print.dineIn': 'Comer aqui',
  'print.takeaway': 'Para levar',
  'print.total': 'Total {amount} · {method}',
  'print.method.PIX': 'Pix',
  'print.method.CARD': 'Cartão',
  'print.method.CASH': 'Dinheiro (pagar no caixa)',
  'print.payAtCounter': 'PAGUE NO CAIXA INFORMANDO ESTA SENHA',
  'print.thanks': 'Obrigado pela preferência!',

  'banner.offline': '⚠️ Sem conexão: usando o último cardápio. Pedidos no cartão são enviados quando a internet voltar.',
  'banner.queued': '{n} pedido(s) aguardando envio.',
} as const

export type MessageKey = keyof typeof pt

const en: Record<MessageKey, string> = {
  'welcome.subtitle': 'Order here, no waiting in line.',
  'welcome.ask': 'Where will you eat?',
  'welcome.dineIn': 'Eat here',
  'welcome.takeaway': 'Take away',
  'welcome.language': 'Language',
  'a11y.contrast': 'High contrast',
  'a11y.bigText': 'Larger text',

  'menu.categories': 'Categories',
  'menu.yourOrder': 'Your order',
  'menu.empty': 'Tap an item to add it.',
  'menu.total': 'Total ({n})',
  'menu.checkout': 'Go to payment',
  'menu.cancel': 'Cancel order',
  'menu.soldOut': 'Sold out',
  'menu.decrease': 'Decrease',
  'menu.increase': 'Increase',
  'menu.without': 'no {x}',
  'menu.live.empty': 'Your order is empty',
  'menu.live.one': '1 item in your order, total {total}',
  'menu.live.many': '{n} items in your order, total {total}',
  'menu.loading': 'Loading menu…',
  'menu.noConnection': 'No connection',
  'menu.loadFailed': 'Could not load the menu.',
  'menu.back': 'Back',

  'custom.title': 'Customize {name}',
  'custom.remove': 'Remove ingredients',
  'custom.without': 'No {x}',
  'custom.extras': 'Extras',
  'custom.back': 'Back',
  'custom.add': 'Add · {price}',

  'upsell.title': 'Would you like to complete your order?',
  'upsell.aria': 'Suggestions for your order',
  'upsell.drinks': 'How about a drink?',
  'upsell.sides': 'Want a side with that?',
  'upsell.desserts': 'Finish with a dessert?',
  'upsell.add': 'Add',
  'upsell.added': 'Added ✓',
  'upsell.continue': 'Continue to payment',
  'upsell.no': 'No, thanks',

  'pay.title': 'Payment',
  'pay.dineIn': 'To eat here',
  'pay.takeaway': 'To take away',
  'pay.couponLabel': 'Discount coupon',
  'pay.apply': 'Apply',
  'pay.couponApplied': 'Coupon {code} applied: −{amount}',
  'pay.remove': 'remove',
  'pay.couponInvalid': 'Invalid coupon',
  'pay.couponExpired': 'Coupon expired',
  'pay.couponExhausted': 'Coupon fully redeemed',
  'pay.couponMin': 'Minimum order of {min} for this coupon',
  'pay.couponError': 'Could not validate the coupon right now',
  'pay.subtotal': 'Subtotal {x}',
  'pay.totalLabel': 'Total',
  'pay.pix': 'Pix',
  'pay.card': 'Card',
  'pay.cash': 'At the counter',
  'pay.offline': 'Unavailable offline',
  'pay.cardHint': 'Tap or insert your card on the card machine.',
  'pay.cardOffline': 'No internet: your order will be sent as soon as the connection is back.',
  'pay.cashHint': 'You get a ticket number and pay the cashier. Your order goes to the kitchen after payment.',
  'pay.back': 'Back to menu',
  'pay.btn.pix': 'Generate Pix QR Code',
  'pay.btn.card': 'Simulate card payment',
  'pay.btn.cash': 'Get ticket and pay at the counter',
  'pay.btn.choose': 'Choose a payment method',
  'pay.processing': 'Processing…',
  'pay.pixScan': 'Scan with your bank app · {amount}',
  'pay.pixExpires': 'Expires in {time} · waiting for payment…',
  'pay.pixQrAlt': 'Pix QR Code for payment',
  'pay.cancel': 'Cancel',
  'pay.expired': 'The QR Code expired and the order was canceled.',
  'pay.tryAgain': 'Try again',
  'pay.failed': 'Could not complete the order',
  'pay.noConnectionPix': 'No connection. Try card or call an attendant.',

  'err.unavailable': 'An item became unavailable. Go back and review your order.',
  'err.invalid': 'Could not process the order. Please review the items.',
  'err.slow': 'Too many attempts. Please wait a moment.',
  'err.generic': 'Something went wrong. Try again or call an attendant.',

  'done.confirmed': 'Order confirmed!',
  'done.registered': 'Order registered!',
  'done.cashNote': 'Go to the counter and give {what} below to pay. Your order only goes to the kitchen after payment (you have 15 minutes).',
  'done.theCode': 'the code',
  'done.theTicket': 'the ticket number',
  'done.offlineNote': 'We are offline. Give this code at the counter',
  'done.keep': 'Keep your ticket number and wait to be called',
  'done.code': 'CODE',
  'done.ticket': 'TICKET',
  'done.print': 'Print ticket',
  'done.new': 'New order ({n}s)',

  'print.dineIn': 'Eat here',
  'print.takeaway': 'Take away',
  'print.total': 'Total {amount} · {method}',
  'print.method.PIX': 'Pix',
  'print.method.CARD': 'Card',
  'print.method.CASH': 'Cash (pay at the counter)',
  'print.payAtCounter': 'PAY AT THE COUNTER GIVING THIS NUMBER',
  'print.thanks': 'Thank you!',

  'banner.offline': '⚠️ No connection: using the last known menu. Card orders are sent when the internet is back.',
  'banner.queued': '{n} order(s) waiting to be sent.',
}

const dictionaries: Record<Lang, Record<MessageKey, string>> = { pt, en }

export type Vars = Record<string, string | number>

/** Traduz uma mensagem, trocando {nome} pelos valores. Chave desconhecida cai para o português. */
export function translate(lang: Lang, key: MessageKey, vars: Vars = {}): string {
  const text = dictionaries[lang][key] ?? dictionaries.pt[key]
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
}

/** Texto do cardápio no idioma escolhido, com português como reserva quando não há tradução cadastrada. */
export const pick = (lang: Lang, ptText: string, enText?: string | null) => (lang === 'en' && enText ? enText : ptText)

interface I18n {
  lang: Lang
  t: (key: MessageKey, vars?: Vars) => string
}

const Context = createContext<I18n>({ lang: 'pt', t: (key, vars) => translate('pt', key, vars) })

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo<I18n>(() => ({ lang, t: (key, vars) => translate(lang, key, vars) }), [lang])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export const useI18n = () => useContext(Context)

/**
 * Mensagem de erro do servidor para o cliente. Em português mostra o texto do servidor (é preciso e já está em
 * português); em outros idiomas usa uma mensagem genérica pelo tipo de erro, para nunca misturar idiomas na tela.
 */
export function friendlyError(error: unknown, lang: Lang, t: I18n['t'], fallback: string): string {
  const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : undefined
  if (lang === 'pt') return error instanceof Error && error.message ? error.message : fallback
  if (status === 409) return t('err.unavailable')
  if (status === 400) return t('err.invalid')
  if (status === 429) return t('err.slow')
  return t('err.generic')
}
