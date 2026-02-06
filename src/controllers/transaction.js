const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency } = require('../utils/helpers');
const { getCategoryByDescription, getCategoryOptions } = require('../utils/categorizer');
const { MainMenu, LinkToWeb, createCategoryButtons } = require('../utils/keyboards');

const parseInput = (text) => {
    const cleanText = text.replace(/^\/(gasto|ganho)\s*/i, '').replace('R$', '').trim();
    const parts = cleanText.split(' ');
    const valorStr = parts[0].replace(',', '.');
    const valor = parseFloat(valorStr);
    const descricao = parts.slice(1).join(' ') || 'Geral';
    return { valor, descricao, valido: !isNaN(valor) };
};

// 1. ADICIONAR TRANSAÇÃO
const addTransaction = async (ctx, type) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte sua conta com /start CODIGO.');

    const { valor, descricao, valido } = parseInput(ctx.message.text);
    if (!valido) return ctx.reply('❌ Formato inválido. Tente: `/gasto 20 Padaria`', { parse_mode: 'Markdown' });

    // Tenta adivinhar categoria
    let categoryId = null;
    if (type === 'expense') {
        categoryId = await getCategoryByDescription(descricao, userId);
    }

    try {
        // Salva (mesmo sem categoria, para garantir)
        const { data: transaction, error } = await supabase
            .from('transactions')
            .insert({
                user_id: userId,
                amount: type === 'expense' ? -Math.abs(valor) : Math.abs(valor),
                description: descricao,
                type: type,
                category_id: categoryId, 
                date: new Date()
            })
            .select() // Retorna os dados salvos para pegarmos o ID
            .single();

        if (error) throw error;

        // CENÁRIO A: Categoria Encontrada
        if (categoryId) {
            ctx.reply(
                `✅ *${type === 'expense' ? 'Gasto' : 'Ganho'} Salvo!*\nValor: ${formatCurrency(valor)}\n📂 Categoria: Detectada Automaticamente`, 
                { parse_mode: 'Markdown' }
            );
        } 
        // CENÁRIO B: Categoria NÃO Encontrada (Mostra Botões)
        else if (type === 'expense') {
            const categories = await getCategoryOptions(userId);
            const keyboard = createCategoryButtons(transaction.id, categories);
            
            ctx.reply(
                `💾 *Gasto Salvo!* Mas não identifiquei a categoria.\n\n👇 *Selecione uma opção abaixo:*`, 
                { parse_mode: 'Markdown', ...keyboard }
            );
        } else {
            // Ganhos geralmente não precisam de tanta categorização, mas pode adaptar
            ctx.reply(`💰 *Ganho Salvo!*`, { parse_mode: 'Markdown' });
        }

    } catch (err) {
        console.error('Erro transaction:', err);
        ctx.reply('⚠️ Erro ao salvar.', MainMenu);
    }
};

// 2. CALLBACK: QUANDO O USUÁRIO CLICA NO BOTÃO DA CATEGORIA
const handleCategoryCallback = async (ctx) => {
    try {
        // data vem como: "set_cat:ID_TRANSACAO:INDEX"
        const parts = ctx.match[1].split(':'); 
        const transactionId = parts[0];
        const categoryIndex = parseInt(parts[1]);

        if (!transactionId || isNaN(categoryIndex)) return;

        const userId = await getAuthenticatedUser(ctx.chat.id);
        
        // BUSCA EXATAMENTE IGUAL À CRIAÇÃO DOS BOTÕES
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name')
            .or(`user_id.eq.${userId},user_id.is.null`)
            .order('name', { ascending: true }); // ORDENAÇÃO OBRIGATÓRIA AQUI

        const selectedCategory = categories[categoryIndex];

        if (!selectedCategory) {
            return ctx.answerCbQuery('❌ Erro: Índice não sincronizado.');
        }

        const { error } = await supabase
            .from('transactions')
            .update({ category_id: selectedCategory.id })
            .eq('id', transactionId);

        if (error) throw error;

        await ctx.editMessageText(
            `✅ Categoria atualizada para: *${selectedCategory.name}*`, 
            { parse_mode: 'Markdown' }
        );

    } catch (err) {
        console.error('Erro ao definir categoria:', err);
        ctx.answerCbQuery('Erro ao atualizar categoria.');
    }
};

module.exports = {
    addExpense: (ctx) => addTransaction(ctx, 'expense'),
    addIncome: (ctx) => addTransaction(ctx, 'income'),
    handleCategoryCallback // Exporta para usar no index.js
};