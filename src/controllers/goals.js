const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency } = require('../utils/helpers');
const { MainMenu } = require('../utils/keyboards');

// Auxiliar visual: [████░░░░░░] 40%
const drawProgressBar = (current, target) => {
    const percentage = Math.min((current / target) * 100, 100);
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage.toFixed(1)}%`;
};

// 1. LISTAR METAS
const listGoals = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte-se com /start.');

    const { data: goals, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error(error);
        return ctx.reply('Erro ao buscar metas.');
    }

    if (!goals || goals.length === 0) {
        return ctx.reply(
            '🎯 *Sem Metas Ativas*\n\nQue tal criar uma nova?\nUse: `/nova_meta Carro 50000`', 
            { parse_mode: 'Markdown' }
        );
    }

    let msg = '🎯 *Painel de Metas*\n\n';
    goals.forEach(g => {
        // Assume colunas: name, current_amount, target_amount
        msg += `📌 *${g.name}*\n` +
               `${drawProgressBar(g.current_amount || 0, g.target_amount)}\n` +
               `💰 ${formatCurrency(g.current_amount || 0)} de ${formatCurrency(g.target_amount)}\n` +
               `👉 Para depositar: \`/investir ${g.id} 100\`\n\n`;
    });

    ctx.reply(msg, { parse_mode: 'Markdown', ...MainMenu });
};

// 2. CRIAR META
const createGoal = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte-se com /start.');

    const parts = ctx.message.text.split(' '); // /nova_meta Nome Valor
    const name = parts[1];
    const targetRaw = parts[2];

    if (!name || !targetRaw) {
        return ctx.reply('❌ Uso incorreto.\nExemplo: `/nova_meta Viagem 5000`', { parse_mode: 'Markdown' });
    }

    const target = parseFloat(targetRaw.replace(',', '.'));

    const { error } = await supabase.from('goals').insert({
        user_id: userId,
        name: name,
        target_amount: target,
        current_amount: 0,
        // Adicione 'deadline' se sua tabela tiver e quiser pedir data
    });

    if (error) {
        console.error(error);
        return ctx.reply('Erro ao criar meta. Verifique se a tabela `goals` existe.');
    }

    ctx.reply(`✅ Meta *${name}* criada! Vamos começar a poupar?`, { parse_mode: 'Markdown' });
};

// 3. INVESTIR (A Lógica Relacional)
const depositGoal = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte-se com /start.');

    const parts = ctx.message.text.split(' '); // /investir ID Valor
    const goalId = parts[1];
    const amountRaw = parts[2];

    if (!goalId || !amountRaw) {
        return ctx.reply('❌ Uso incorreto.\nExemplo: `/investir ID_DA_META 200`\n(Veja o ID no comando /metas)', { parse_mode: 'Markdown' });
    }

    const amount = parseFloat(amountRaw.replace(',', '.'));

    // A. Busca a meta atual para validar e pegar o saldo atual
    const { data: goal, error: fetchError } = await supabase
        .from('goals')
        .select('*')
        .eq('id', goalId)
        .eq('user_id', userId) // Garante que a meta é do usuário
        .single();

    if (fetchError || !goal) return ctx.reply('🚫 Meta não encontrada ou não pertence a você.');

    // B. Insere no Histórico (goal_deposits)
    const { error: depositError } = await supabase
        .from('goal_deposits')
        .insert({
            goal_id: goalId,
            amount: amount,
            user_id: userId, // Se sua tabela goal_deposits pedir user_id
            created_at: new Date()
        });

    if (depositError) {
        console.error('Erro goal_deposits:', depositError);
        return ctx.reply('Erro ao registrar o depósito.');
    }

    // C. Atualiza o Total na Meta Principal (goals)
    const novoTotal = (parseFloat(goal.current_amount) || 0) + amount;
    
    const { error: updateError } = await supabase
        .from('goals')
        .update({ current_amount: novoTotal })
        .eq('id', goalId);

    if (updateError) {
        console.error('Erro update goals:', updateError);
        return ctx.reply('Depósito registrado, mas erro ao atualizar saldo visual.');
    }

    // Feedback Consultivo
    ctx.reply(
        `🚀 *Depósito Confirmado!*\n\n` +
        `Você investiu: ${formatCurrency(amount)}\n` +
        `Meta *${goal.name}*: ${formatCurrency(novoTotal)} / ${formatCurrency(goal.target_amount)}\n\n` +
        `Continue assim!`, 
        { parse_mode: 'Markdown' }
    );
};

module.exports = { listGoals, createGoal, depositGoal };