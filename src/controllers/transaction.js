const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency } = require('../utils/helpers');
const { MainMenu, LinkToWeb } = require('../utils/keyboards');

// Função auxiliar para interpretar texto: "50 padaria"
const parseInput = (text) => {
    const cleanText = text.replace(/^\/(gasto|ganho)\s*/i, '').replace('R$', '').trim();
    const parts = cleanText.split(' ');
    const valorStr = parts[0].replace(',', '.');
    const valor = parseFloat(valorStr);
    const descricao = parts.slice(1).join(' ') || 'Sem descrição';
    return { valor, descricao, valido: !isNaN(valor) };
};

const addTransaction = async (ctx, type) => {
    // 1. Autenticação
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Você precisa conectar sua conta primeiro. Digite /start para instruções.');

    // 2. Parse do Input
    const { valor, descricao, valido } = parseInput(ctx.message.text);
    
    // Instrução de uso se falhar
    if (!valido) {
        const cmd = type === 'expense' ? '/gasto' : '/ganho';
        return ctx.reply(`❌ Formato inválido.\nUse: \`${cmd} VALOR DESCRIÇÃO\`\nEx: \`${cmd} 50.00 Mercado\``, { parse_mode: 'Markdown' });
    }

    // 3. Salvar no Supabase (Usando o UUID do site!)
    try {
        const { error } = await supabase
            .from('transactions')
            .insert({
                user_id: userId, // <--- O SEGREDO ESTÁ AQUI (UUID)
                amount: type === 'expense' ? -Math.abs(valor) : Math.abs(valor),
                description: descricao,
                type: type,
                category_id: null, // Pode implementar categorização depois
                date: new Date() // Ajuste o nome da coluna de data conforme sua tabela (created_at ou date)
            });

        if (error) throw error;

        const emoji = type === 'expense' ? '💸' : '💰';
        ctx.reply(
            `${emoji} *${type === 'expense' ? 'Despesa' : 'Receita'} Registrada!*\n\nValor: ${formatCurrency(valor)}\nDesc: ${descricao}`, 
            { parse_mode: 'Markdown', ...LinkToWeb } // Mostra botão para ver no site
        );

    } catch (err) {
        console.error('Erro transaction:', err);
        ctx.reply('⚠️ Erro ao salvar. Tente novamente.', MainMenu);
    }
};

module.exports = {
    addExpense: (ctx) => addTransaction(ctx, 'expense'),
    addIncome: (ctx) => addTransaction(ctx, 'income')
};