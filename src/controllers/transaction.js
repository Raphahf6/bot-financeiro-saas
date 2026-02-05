const supabase = require('../config/supabase');
const { MESSAGES } = require('../config/constants');
const { formatCurrency } = require('../utils/helpers');
const { parseTransactionInput } = require('./inputs');
const { mainKeyboard } = require('../utils/keyboards');

// Adicionar Despesa
const addExpense = async (ctx) => {
    const input = parseTransactionInput(ctx.message.text);

    if (!input.isValid) {
        return ctx.reply(MESSAGES.ERROR_INVALID_INPUT, { parse_mode: 'Markdown' });
    }

    try {
        const { error } = await supabase
            .from('transactions') // VERIFIQUE O NOME DA SUA TABELA
            .insert({
                user_id: ctx.from.id.toString(),
                amount: -input.amount, // Negativo para gasto
                description: input.description,
                type: 'expense',
                created_at: new Date()
            });

        if (error) throw error;

        const valorFormatado = formatCurrency(input.amount);
        ctx.reply(MESSAGES.SAVED_EXPENSE(valorFormatado, input.description), { parse_mode: 'Markdown', ...mainKeyboard });

    } catch (err) {
        console.error('Erro ao salvar despesa:', err);
        ctx.reply(MESSAGES.ERROR_GENERIC, mainKeyboard);
    }
};

// Adicionar Ganho
const addIncome = async (ctx) => {
    const input = parseTransactionInput(ctx.message.text);

    if (!input.isValid) {
        return ctx.reply(MESSAGES.ERROR_INVALID_INPUT, { parse_mode: 'Markdown' });
    }

    try {
        const { error } = await supabase
            .from('transactions')
            .insert({
                user_id: ctx.from.id.toString(),
                amount: input.amount, // Positivo para ganho
                description: input.description,
                type: 'income',
                created_at: new Date()
            });

        if (error) throw error;

        const valorFormatado = formatCurrency(input.amount);
        ctx.reply(MESSAGES.SAVED_INCOME(valorFormatado, input.description), { parse_mode: 'Markdown', ...mainKeyboard });

    } catch (err) {
        console.error('Erro ao salvar ganho:', err);
        ctx.reply(MESSAGES.ERROR_GENERIC, mainKeyboard);
    }
};

module.exports = { addExpense, addIncome };