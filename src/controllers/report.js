const supabase = require('../config/supabase');
const { formatCurrency, formatDate } = require('../utils/helpers');
const { mainKeyboard } = require('../utils/keyboards');
const { MESSAGES } = require('../config/constants');

// Ver Saldo
const getBalance = async (ctx) => {
    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('amount')
            .eq('user_id', ctx.from.id.toString());

        if (error) throw error;

        // Soma tudo
        const total = data.reduce((acc, curr) => acc + curr.amount, 0);
        
        ctx.reply(`💰 *Saldo Atual:* ${formatCurrency(total)}`, { parse_mode: 'Markdown', ...mainKeyboard });

    } catch (err) {
        console.error('Erro ao buscar saldo:', err);
        ctx.reply(MESSAGES.ERROR_GENERIC, mainKeyboard);
    }
};

// Ver Extrato
const getStatement = async (ctx) => {
    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', ctx.from.id.toString())
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) throw error;

        if (!data || data.length === 0) {
            return ctx.reply(MESSAGES.NO_DATA, mainKeyboard);
        }

        let msg = '📄 *Últimas 5 Movimentações:*\n\n';
        data.forEach(t => {
            const icon = t.type === 'expense' ? '🔻' : '🟢';
            msg += `${icon} *${formatCurrency(t.amount)}* - ${t.description}\n📅 ${formatDate(t.created_at)}\n\n`;
        });

        ctx.reply(msg, { parse_mode: 'Markdown', ...mainKeyboard });

    } catch (err) {
        console.error('Erro ao buscar extrato:', err);
        ctx.reply(MESSAGES.ERROR_GENERIC, mainKeyboard);
    }
};

// Ver Metas (Exemplo Fixo por enquanto, pois não temos tabela de metas definida)
const getGoals = async (ctx) => {
    ctx.reply(
        '🎯 *Suas Metas (Beta)*\n\n' +
        '1. Reserva de Emergência: [====..] 60%\n' +
        '2. Viagem Férias: [==....] 30%\n\n' +
        '_Funcionalidade de cadastro de metas em desenvolvimento._',
        { parse_mode: 'Markdown', ...mainKeyboard }
    );
};

module.exports = { getBalance, getStatement, getGoals };