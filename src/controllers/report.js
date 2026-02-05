const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency, formatDate } = require('../utils/helpers');
const { MainMenu, LinkToWeb } = require('../utils/keyboards');

// 1. DASHBOARD COMPLETO (Novo)
const getDashboard = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte-se com /start.');

    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();

    // Busca transações do mês atual
    const { data: transactions } = await supabase
        .from('transactions')
        .select('amount, type')
        .eq('user_id', userId)
        .gte('date', primeiroDiaMes); // Ajuste 'date' para 'created_at' se necessário

    // Cálculos
    let receitas = 0;
    let despesas = 0;

    transactions.forEach(t => {
        if (t.type === 'income') receitas += Number(t.amount);
        else despesas += Math.abs(Number(t.amount));
    });

    const saldo = receitas - despesas;
    const status = saldo >= 0 ? '🔵 Positivo' : '🔴 Negativo';

    // Busca saldo total acumulado (não só do mês)
    const { data: totalData } = await supabase.from('transactions').select('amount').eq('user_id', userId);
    const saldoTotal = totalData.reduce((acc, curr) => acc + Number(curr.amount), 0);

    const msg = 
        `📊 *Resumo Financeiro (Mês Atual)*\n\n` +
        `📈 Receitas: ${formatCurrency(receitas)}\n` +
        `📉 Despesas: ${formatCurrency(despesas)}\n` +
        `-----------------------------\n` +
        `⚖️ Balanço Mês: ${formatCurrency(saldo)}\n` +
        `🏦 *Saldo Total Acumulado: ${formatCurrency(saldoTotal)}*\n\n` +
        `Status: ${status}`;

    ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });
};

// 2. EXTRATO (Mantido)
const getStatement = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(5);

    if (!data || data.length === 0) return ctx.reply('📭 Sem movimentações.');

    let msg = '📄 *Últimas Movimentações:*\n\n';
    data.forEach(t => {
        const icon = t.type === 'expense' ? '🔻' : '🟢';
        msg += `${icon} *${formatCurrency(Math.abs(t.amount))}* - ${t.description}\n📅 ${formatDate(t.date)}\n\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });
};

module.exports = { getDashboard, getStatement };