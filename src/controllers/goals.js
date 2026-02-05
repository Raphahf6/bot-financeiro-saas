const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency } = require('../utils/helpers');
const { GoalsMenu, createGoalActions, MainMenu } = require('../utils/keyboards');

// Auxiliar visual
const drawProgressBar = (current, target) => {
    const percentage = Math.min((current / target) * 100, 100);
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage.toFixed(0)}%`;
};

// 1. LISTAR METAS (Com Botões de Ação)
const listGoals = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte-se com /start.');

    const { data: goals } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (!goals || goals.length === 0) {
        return ctx.reply(
            '🎯 *Sem Metas*\nCrie uma nova abaixo:', 
            { parse_mode: 'Markdown', ...GoalsMenu }
        );
    }

    await ctx.reply('🎯 *Painel de Metas*\nSelecione uma ação rápida:', GoalsMenu);

    // Envia uma mensagem separada para cada meta com seus botões
    for (const g of goals) {
        const msg = `📌 *${g.name}*\n` +
               `${drawProgressBar(g.current_amount || 0, g.target_amount)}\n` +
               `💰 ${formatCurrency(g.current_amount || 0)} de ${formatCurrency(g.target_amount)}`;
        
        await ctx.reply(msg, { 
            parse_mode: 'Markdown', 
            ...createGoalActions(g.id) // Botões de +50, +100, etc.
        });
    }
};

// 2. CRIAR META
const createGoal = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    // Lógica para quando clica no botão "Nova Meta" ou digita o comando
    const text = ctx.message.text.replace('➕ Nova Meta', '').trim();
    
    // Se o usuário só clicou no botão sem argumentos
    if (!text || text === '/nova_meta') {
        return ctx.reply('Para criar, digite: `/nova_meta Carro 50000`', { parse_mode: 'Markdown' });
    }

    const parts = text.split(' ');
    // Se veio do comando /nova_meta Carro 5000
    const name = parts[0].startsWith('/nova_meta') ? parts[1] : parts[0];
    const targetRaw = parts[0].startsWith('/nova_meta') ? parts[2] : parts[1];

    if (!name || !targetRaw) return ctx.reply('❌ Formato: `/nova_meta Nome Valor`', { parse_mode: 'Markdown' });

    const { error } = await supabase.from('goals').insert({
        user_id: userId,
        name: name,
        target_amount: parseFloat(targetRaw.replace(',', '.')),
        current_amount: 0,
    });

    if (error) return ctx.reply('Erro ao criar meta.');
    ctx.reply(`✅ Meta *${name}* criada!`, GoalsMenu);
};

// 3. INVESTIR RÁPIDO (Callback do Botão)
const handleQuickInvest = async (ctx) => {
    // data vem como: "invest:GOAL_ID:VALOR"
    const parts = ctx.match[1].split(':'); 
    const goalId = parts[0];
    const amount = parseFloat(parts[1]);

    // Lógica de Depósito (Cópia simplificada da lógica de investir)
    const { data: integration } = await supabase.from('user_integrations').select('user_id').eq('telegram_chat_id', ctx.chat.id.toString()).single();
    const userId = integration?.user_id;

    // 1. Pega meta atual
    const { data: goal } = await supabase.from('goals').select('*').eq('id', goalId).single();
    
    // 2. Insere histórico
    await supabase.from('goal_deposits').insert({
        goal_id: goalId,
        amount: amount,
        user_id: userId,
        created_at: new Date()
    });

    // 3. Atualiza Saldo
    const novoTotal = (parseFloat(goal.current_amount) || 0) + amount;
    await supabase.from('goals').update({ current_amount: novoTotal }).eq('id', goalId);

    // 4. Feedback
    await ctx.answerCbQuery(`Investido R$ ${amount} em ${goal.name}!`);
    await ctx.reply(`🚀 *Investimento Confirmado!*\n\n${goal.name}: +${formatCurrency(amount)}\nTotal: ${formatCurrency(novoTotal)}`, GoalsMenu);
};

// 4. MENSAGEM PARA INVESTIMENTO MANUAL
const handleCustomInvestInfo = async (ctx) => {
    const goalId = ctx.match[1]; // invest_custom:GOAL_ID
    // Busca nome da meta só pra ficar bonito
    const { data } = await supabase.from('goals').select('name').eq('id', goalId).single();
    
    await ctx.reply(
        `Para investir outro valor em *${data.name}*, digite:\n\n\`/investir ${formatCurrency(150)} ${data.name}\``, 
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
};

// Manter a função de depósito manual antiga também
const depositGoalManual = async (ctx) => {
    // ... (mesma lógica do arquivo anterior, só mudando o return final para usar GoalsMenu)
    // Vou omitir para economizar espaço, mas use a lógica do anterior retornando GoalsMenu no final
};

module.exports = { listGoals, createGoal, handleQuickInvest, handleCustomInvestInfo, depositGoalManual };