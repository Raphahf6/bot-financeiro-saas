const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency, formatDate } = require('../utils/helpers');
const { MainMenu, LinkToWeb } = require('../utils/keyboards');

// 1. DASHBOARD COMPLETO
const getDashboard = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte-se com /start.');

    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();

    try {
        // A. BUSCAR SALÁRIO BASE (Corrigido para 'profiles' e 'monthly_income')
        const { data: profileData, error: profileError } = await supabase
            .from('profiles') // <--- Tabela correta
            .select('monthly_income') // <--- Coluna correta
            .eq('id', userId)
            .single();

        // Se der erro ou não tiver perfil, assume 0
        const salarioBase = (profileData && profileData.monthly_income) ? parseFloat(profileData.monthly_income) : 0;

        // B. BUSCAR TRANSAÇÕES DO MÊS
        const { data: transactions, error: transError } = await supabase
            .from('transactions')
            .select('amount, type')
            .eq('user_id', userId)
            .gte('date', primeiroDiaMes);

        if (transError) throw transError;

        // C. CÁLCULOS
        let ganhosExtras = 0;
        let despesas = 0;

        transactions.forEach(t => {
            const valor = Number(t.amount);
            if (t.type === 'income') {
                ganhosExtras += Math.abs(valor);
            } else {
                despesas += Math.abs(valor);
            }
        });

        const receitaTotal = salarioBase + ganhosExtras;
        const saldo = receitaTotal - despesas;
        
        const status = saldo >= 0 ? '🔵 Positivo' : '🔴 Negativo';
        const percentualComprometido = receitaTotal > 0 ? ((despesas / receitaTotal) * 100).toFixed(1) : 0;

        const msg = 
            `📊 *Resumo Financeiro (Mês Atual)*\n\n` +
            `💵 *Receitas Totais:* ${formatCurrency(receitaTotal)}\n` +
            `   ├─ Salário Base: ${formatCurrency(salarioBase)}\n` +
            `   └─ Extras: ${formatCurrency(ganhosExtras)}\n\n` +
            `📉 *Despesas:* ${formatCurrency(despesas)}\n` +
            `   └─ Comprometido: ${percentualComprometido}%\n` +
            `-----------------------------\n` +
            `⚖️ *Saldo Disponível: ${formatCurrency(saldo)}*\n` +
            `Status: ${status}`;

        ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });

    } catch (err) {
        console.error('Erro no dashboard:', err);
        ctx.reply('⚠️ Erro ao calcular resumo. Verifique se seu perfil está completo no site.', MainMenu);
    }
};

// 2. EXTRATO (Mantido igual)
const getStatement = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    
    const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(5);

    if (!data || data.length === 0) return ctx.reply('📭 Sem movimentações recentes.');

    let msg = '📄 *Últimas Movimentações:*\n\n';
    data.forEach(t => {
        const icon = t.type === 'expense' ? '🔻' : '🟢';
        const dataFormatada = formatDate(t.date || t.created_at);
        msg += `${icon} *${formatCurrency(Math.abs(t.amount))}* - ${t.description}\n📅 ${dataFormatada}\n\n`;
    });
    
    ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });
};

module.exports = { getDashboard, getStatement };