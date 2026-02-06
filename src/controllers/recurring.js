const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency } = require('../utils/helpers');
const { RecurringMenu, createRecurringCategoryButtons } = require('../utils/keyboards');
const { getCategoryByDescription, getCategoryOptions } = require('../utils/categorizer');

// 1. LISTAR
const listRecurring = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte-se com /start.');

    // Busca categorias também para mostrar o nome
    const { data: bills, error } = await supabase
        .from('recurring_bills')
        .select(`
            *,
            categories (name)
        `)
        .eq('user_id', userId)
        .eq('type', 'expense')
        .order('due_day', { ascending: true });

    if (error) return ctx.reply('Erro ao buscar contas.');

    if (!bills || bills.length === 0) {
        return ctx.reply(
            '📅 *Sem Contas Mensais*\nCadastre seus gastos fixos para o bot prever seu saldo.', 
            { parse_mode: 'Markdown', ...RecurringMenu }
        );
    }

    let total = 0;
    let msg = '📅 *Suas Contas Mensais:*\n\n';
    
    bills.forEach(b => {
        total += parseFloat(b.amount);
        const catName = b.categories?.name ? `(${b.categories.name})` : '⚠️ Sem Categoria';
        msg += `🗓️ Dia ${b.due_day}: *${b.description}* ${catName}\n💰 ${formatCurrency(b.amount)}\n────────────────\n`;
    });

    msg += `\n💰 *Total Fixo: ${formatCurrency(total)}*`;
    
    ctx.reply(msg, { parse_mode: 'Markdown', ...RecurringMenu });
};

// 2. ADICIONAR (Com verificação de categoria)
const addRecurring = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return;

    // /fixa DIA VALOR NOME
    const parts = ctx.message.text.replace(/\s+/g, ' ').split(' ');
    const dayRaw = parts[1];
    const amountRaw = parts[2];
    const description = parts.slice(3).join(' ');

    if (!dayRaw || !amountRaw || !description) {
        return ctx.reply('❌ Use: `/fixa DIA VALOR NOME`\nEx: `/fixa 05 150 Internet`', { parse_mode: 'Markdown' });
    }

    const dueDay = parseInt(dayRaw);
    const amount = parseFloat(amountRaw.replace(',', '.'));
    
    // 1. Tenta identificar categoria
    const categoryId = await getCategoryByDescription(description, userId);

    // 2. Salva (Mesmo se for null)
    const { data: savedBill, error } = await supabase
        .from('recurring_bills')
        .insert({
            user_id: userId,
            amount: amount,
            description: description,
            due_day: dueDay,
            category_id: categoryId,
            type: 'expense'
        })
        .select()
        .single();

    if (error) return ctx.reply('Erro ao salvar.');

    // 3. Verifica se precisa pedir categoria manual
    if (categoryId) {
        // Sucesso total
        ctx.reply(
            `✅ *Conta Mensal Adicionada!*\n\n📝 ${description}\n📂 Categoria: Detectada\n💰 ${formatCurrency(amount)}\n🗓️ Todo dia ${dueDay}`, 
            { parse_mode: 'Markdown', ...RecurringMenu }
        );
    } else {
        // Falha na detecção: Pede ajuda ao usuário
        const categories = await getCategoryOptions(userId);
        const keyboard = createRecurringCategoryButtons(savedBill.id, categories);

        ctx.reply(
            `💾 *Conta Salva!* Mas não identifiquei a categoria.\nIsso é importante para seu orçamento.\n\n👇 *Selecione a categoria de ${description}:*`, 
            { parse_mode: 'Markdown', ...keyboard }
        );
    }
};

// 3. CALLBACK DE CATEGORIA (Quando clica no botão)
const handleRecurringCategoryCallback = async (ctx) => {
    try {
        // data: "set_rec_cat:BILL_ID:INDEX"
        const parts = ctx.match[1].split(':');
        const billId = parts[0];
        const categoryIndex = parseInt(parts[1]);

        if (!billId || isNaN(categoryIndex)) return;

        const userId = await getAuthenticatedUser(ctx.chat.id);
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name')
            .or(`user_id.eq.${userId},user_id.is.null`)
            .order('name', { ascending: true }); // Mesma ordem da geração

        const selectedCategory = categories[categoryIndex];

        if (!selectedCategory) return ctx.answerCbQuery('Erro: Índice inválido.');

        const { error } = await supabase
            .from('recurring_bills')
            .update({ category_id: selectedCategory.id })
            .eq('id', billId);

        if (error) throw error;

        await ctx.editMessageText(
            `✅ Categoria definida como: *${selectedCategory.name}*`, 
            { parse_mode: 'Markdown' }
        );
        
    } catch (err) {
        console.error('Erro callback recurring:', err);
        ctx.answerCbQuery('Erro ao atualizar.');
    }
};
module.exports = { listRecurring, addRecurring, handleRecurringCategoryCallback };