const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency } = require('../utils/helpers');
const { MainMenu } = require('../utils/keyboards');

const drawProgressBar = (current, target) => {
    const percentage = Math.min((current / target) * 100, 100);
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage.toFixed(1)}%`;
};

const listGoals = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte-se com /start.');

    const { data: goals } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (!goals || goals.length === 0) {
        return ctx.reply('🎯 *Sem Metas*\nCrie uma: `/nova_meta Viagem 5000`', { parse_mode: 'Markdown' });
    }

    let msg = '🎯 *Suas Metas*\n\n';
    goals.forEach(g => {
        msg += `📌 *${g.name}*\n` +
               `${drawProgressBar(g.current_amount || 0, g.target_amount)}\n` +
               `💰 ${formatCurrency(g.current_amount || 0)} de ${formatCurrency(g.target_amount)}\n` +
               `👉 Investir: \`/investir 100 ${g.name}\`\n\n`; // Instrução atualizada
    });

    ctx.reply(msg, { parse_mode: 'Markdown', ...MainMenu });
};

const createGoal = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return;

    const parts = ctx.message.text.split(' ');
    const name = parts[1];
    const targetRaw = parts[2];

    if (!name || !targetRaw) {
        return ctx.reply('❌ Exemplo: `/nova_meta Carro 50000`', { parse_mode: 'Markdown' });
    }

    const { error } = await supabase.from('goals').insert({
        user_id: userId,
        name: name,
        target_amount: parseFloat(targetRaw.replace(',', '.')),
        current_amount: 0,
    });

    if (error) return ctx.reply('Erro ao criar meta.');
    ctx.reply(`✅ Meta *${name}* criada!`, { parse_mode: 'Markdown' });
};

// --- NOVA LÓGICA DE INVESTIR POR NOME ---
const depositGoal = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte-se com /start.');

    // Remove o comando '/investir' e limpa espaços
    const cleanText = ctx.message.text.replace(/^\/investir\s*/i, '').trim();
    
    // Divide em partes: Esperamos [VALOR] [NOME DA META...]
    const parts = cleanText.split(' ');
    
    // O primeiro item deve ser o valor
    const amountRaw = parts[0];
    const amount = parseFloat(amountRaw?.replace(',', '.'));
    
    // O resto é o nome da meta (pode ter espaços, ex: "Viagem Disney")
    const goalNameQuery = parts.slice(1).join(' ');

    if (!amount || isNaN(amount) || !goalNameQuery) {
        return ctx.reply(
            '❌ Formato inválido.\nUse: `/investir VALOR NOME_DA_META`\nExemplo: `/investir 100 Viagem`', 
            { parse_mode: 'Markdown' }
        );
    }

    // 1. Busca a meta pelo NOME (case insensitive)
    const { data: goals, error: fetchError } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .ilike('name', `%${goalNameQuery}%`); // Busca aproximada

    if (fetchError || !goals || goals.length === 0) {
        return ctx.reply(`🚫 Nenhuma meta encontrada com o nome "${goalNameQuery}".\nUse /metas para ver os nomes exatos.`);
    }

    // Se achar mais de uma (ex: "Viagem EUA" e "Viagem Europa" ao buscar "Viagem"), pede precisão
    if (goals.length > 1) {
        return ctx.reply(`⚠️ Encontrei mais de uma meta com esse nome. Seja mais específico.`);
    }

    const goal = goals[0]; // Meta encontrada

    // 2. Registra o Depósito
    const { error: depositError } = await supabase
        .from('goal_deposits')
        .insert({
            goal_id: goal.id,
            amount: amount,
            user_id: userId,
            created_at: new Date() // Coluna de data do depósito
        });

    if (depositError) {
        console.error('Erro ao depositar:', depositError);
        return ctx.reply('Erro ao registrar depósito.');
    }

    // 3. Atualiza o saldo da meta
    const novoTotal = (parseFloat(goal.current_amount) || 0) + amount;
    
    await supabase
        .from('goals')
        .update({ current_amount: novoTotal })
        .eq('id', goal.id);

    ctx.reply(
        `🚀 *Investimento Realizado!*\n\n` +
        `Meta: *${goal.name}*\n` +
        `Valor: +${formatCurrency(amount)}\n` +
        `Novo Saldo: ${formatCurrency(novoTotal)} / ${formatCurrency(goal.target_amount)}`,
        { parse_mode: 'Markdown' }
    );
};

module.exports = { listGoals, createGoal, depositGoal };