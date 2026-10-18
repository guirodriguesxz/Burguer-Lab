// Roda antes de cada arquivo de teste, antes de qualquer import da aplicação.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://burger:burger@localhost:5432/burgerlab_test?schema=public'
process.env.JWT_SECRET = 'test-jwt-secret'
process.env.PIX_WEBHOOK_SECRET = 'test-webhook-secret'
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT ?? '1000'
process.env.RATE_LIMIT = '100000'
