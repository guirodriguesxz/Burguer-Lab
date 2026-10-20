"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.demoRole = void 0;
exports.isDemoMode = isDemoMode;
exports.demoLogins = demoLogins;
function isDemoMode(env = process.env) {
    return env.DEMO_MODE === 'true' && env.PIX_PROVIDER !== 'mercadopago';
}
function demoLogins(env = process.env) {
    if (!isDemoMode(env))
        return [];
    return (env.DEMO_LOGINS ?? '')
        .split(';')
        .map((entry) => entry.split('|').map((p) => p.trim()))
        .filter((p) => p.length === 3 && p.every(Boolean))
        .map(([label, email, password]) => ({ label, email, password }));
}
const ROLE_BY_LABEL = {
    admin: 'ADMIN',
    cozinha: 'KITCHEN',
    kitchen: 'KITCHEN',
    caixa: 'CASHIER',
    cashier: 'CASHIER',
};
const demoRole = (label) => ROLE_BY_LABEL[label.trim().toLowerCase()] ?? null;
exports.demoRole = demoRole;
