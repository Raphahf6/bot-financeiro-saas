const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency } = require('../utils/helpers');
const { MainMenu } = require('../utils/keyboards');
const { getCategoryByDescription } = require('../utils/categorizer');
const { RecurringMenu } = require('../utils/keyboards'); // <--- MENU NOVO

const listRecurring = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte-se com /start.');

    const { data: bills } = await supabase
        .from('recurring_bills')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'expense')
        .order('due_day', { ascending: true });

    if (!bills || bills.length === 0) {
        return ctx.reply(
            '📅 *Sem Contas Fixas*\nClique abaixo para adicionar:', 
            { parse_mode: 'Markdown', ...RecurringMenu }
        );
    }

    let total = 0;
    let msg = '📅 *Suas Contas Fixas:*\n\n';
    bills.forEach(b => {
        total += parseFloat(b.amount);
        msg += `🗓️ Dia ${b.due_day}: *${b.description}* — ${formatCurrency(b.amount)}\n`;
    });
    msg += `\n💰 *Total: ${formatCurrency(total)}*`;
    
    ctx.reply(msg, { parse_mode: 'Markdown', ...RecurringMenu });
};

// 2. ADICIONAR CONTA FIXA
const addRecurring = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte-se com /start.');

    // Novo Formato Obrigatório: /fixa DIA VALOR DESCRIÇÃO
    // Ex: /fixa 05 150.90 Internet Fibra
    const parts = ctx.message.text.replace(/\s+/g, ' ').split(' ');
    
    const dayRaw = parts[1];
    const amountRaw = parts[2];
    const description = parts.slice(3).join(' ');

    if (!dayRaw || !amountRaw || !description) {
        return ctx.reply(
            '❌ Formato incorreto.\n' +
            'Como o dia de vencimento é obrigatório, use:\n\n' +
            '`/fixa DIA VALOR NOME`\n' +
            'Exemplo: `/fixa 10 150.00 Internet`', 
            { parse_mode: 'Markdown' }
        );
    }

    const dueDay = parseInt(dayRaw);
    const amount = parseFloat(amountRaw.replace(',', '.'));

    // Validações básicas
    if (isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
        return ctx.reply('❌ Dia inválido (Use entre 1 e 31).');
    }
    if (isNaN(amount)) {
        return ctx.reply('❌ Valor inválido.');
    }

    // Tenta categorizar automaticamente
    const categoryId = await getCategoryByDescription(description, userId);

    const { error } = await supabase.from('recurring_bills').insert({
        user_id: userId,
        amount: amount,
        description: description,
        due_day: dueDay,       // Campo obrigatório da sua tabela
        category_id: categoryId,
        type: 'expense'        // Padrão 'expense'
    });

    if (error) {
        console.error(error);
        return ctx.reply('Erro ao salvar conta fixa. Verifique se o dia está correto.');
    }

    ctx.reply(
        `✅ Conta Fixa Adicionada!\n\n` +
        `📝 *${description}*\n` +
        `💰 ${formatCurrency(amount)}\n` +
        `🗓️ Vence todo dia ${dueDay}`, 
        { parse_mode: 'Markdown' }
    );
};

module.exports = { listRecurring, addRecurring };