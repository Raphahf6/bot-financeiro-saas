const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency, formatDate } = require('../utils/helpers');
const { MainMenu, LinkToWeb, DASHBOARD_URL } = require('../utils/keyboards');

// SALDO
const getBalance = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte sua conta com /start.');

    const { data, error } = await supabase
        .from('transactions')
        .select('amount')
        .eq('user_id', userId);

    if (error) return ctx.reply('Erro ao calcular saldo.');

    const total = data.reduce((acc, cur) => acc + cur.amount, 0);
    
    ctx.reply(
        `💵 *Saldo Atual*\n\n${formatCurrency(total)}\n\n_Visualize gráficos detalhados no site._`, 
        { parse_mode: 'Markdown', ...LinkToWeb }
    );
};

// EXTRATO
const getStatement = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte sua conta com /start.');

    const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false }) // Verifique se sua coluna é 'date' ou 'created_at'
        .limit(5);

    if (!data || data.length === 0) return ctx.reply('📭 Nenhuma movimentação recente.', MainMenu);

    let msg = '📄 *Últimas Movimentações:*\n\n';
    data.forEach(t => {
        const icon = t.amount < 0 ? '🔻' : '🟢';
        msg += `${icon} *${formatCurrency(Math.abs(t.amount))}* - ${t.description}\n📅 ${formatDate(t.date || t.created_at)}\n\n`;
    });

    ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });
};

// METAS (Simulação com Link)
const getGoals = async (ctx) => {
    // Como metas geralmente são complexas, melhor mandar ver no site
    ctx.reply(
        `🎯 *Suas Metas*\n\nPara gerenciar e visualizar o progresso detalhado das suas metas, acesse o painel completo:\n\n🔗 ${DASHBOARD_URL}`,
        { parse_mode: 'Markdown', ...MainMenu }
    );
};

module.exports = { getBalance, getStatement, getGoals };