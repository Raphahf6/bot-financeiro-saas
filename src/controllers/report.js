const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency, formatDate } = require('../utils/helpers');
const { MainMenu, LinkToWeb } = require('../utils/keyboards');

// Função visual: Barra de Progresso
const drawBudgetBar = (spent, budget) => {
    if (!budget || budget <= 0) return ''; 
    const percentage = Math.min((spent / budget) * 100, 100);
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    let icon = '🟢';
    if (percentage >= 100) icon = '🔴';
    else if (percentage >= 80) icon = '⚠️';
    return `\n${icon} [${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage.toFixed(0)}%`;
};

// 1. DASHBOARD COMPLETO
const getDashboard = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte sua conta com /start.');

    // AJUSTE DE DATA (BRASIL GMT-3)
    const hoje = new Date();
    // Cria data do dia 1 do mês atual, zerando horas
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    // Ajusta para garantir que pegue desde o início do dia no fuso BR (subtrai 3h se estiver em UTC puro)
    primeiroDia.setHours(0, 0, 0, 0); 
    const dataInicioIso = primeiroDia.toISOString();

    try {
        // A. Perfil (Salário)
        const { data: profile } = await supabase
            .from('profiles')
            .select('monthly_income')
            .eq('id', userId)
            .single();
        const salarioBase = parseFloat(profile?.monthly_income || 0);

        // B. Fixas (Recorrentes)
        const { data: recurring } = await supabase
            .from('recurring_bills')
            .select('amount')
            .eq('user_id', userId)
            .eq('type', 'expense');
        const totalFixas = recurring?.reduce((acc, curr) => acc + parseFloat(curr.amount), 0) || 0;

        // C. Transações (Mudança: Tenta created_at se date falhar, ou vice-versa)
        // Vamos usar 'created_at' que é padrão do Supabase
        const { data: transactions } = await supabase
            .from('transactions')
            .select('amount, type, category_id, description')
            .eq('user_id', userId)
            .gte('created_at', dataInicioIso); // <--- CORREÇÃO AQUI (created_at)

        // D. Categorias
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name, budget')
            .or(`user_id.eq.${userId},user_id.is.null`);

        // --- PROCESSAMENTO ---
        let ganhosExtras = 0;
        let gastosVariaveis = 0;
        const gastosPorCategoria = {}; // { id_cat: valor }

        transactions?.forEach(t => {
            const val = parseFloat(t.amount);
            if (t.type === 'income') {
                ganhosExtras += Math.abs(val);
            } else {
                gastosVariaveis += Math.abs(val);
                
                // Agrupa por Categoria
                const catId = t.category_id || 'sem_categoria';
                gastosPorCategoria[catId] = (gastosPorCategoria[catId] || 0) + Math.abs(val);
            }
        });

        // Totais
        const receitaTotal = salarioBase + ganhosExtras;
        const despesaTotal = totalFixas + gastosVariaveis; 
        const saldoPrevisto = receitaTotal - despesaTotal;
        const status = saldoPrevisto >= 0 ? '🔵 Azul' : '🔴 Vermelho';

        // --- VISUALIZAÇÃO ---
        let msg = `📊 *Resumo Financeiro Mensal*\n\n`;
        msg += `💵 *Receitas:* ${formatCurrency(receitaTotal)}\n`;
        msg += `   ├ Base: ${formatCurrency(salarioBase)}\n`;
        msg += `   └ Extras: ${formatCurrency(ganhosExtras)}\n`;
        msg += `\n📉 *Despesas:* ${formatCurrency(despesaTotal)}\n`;
        msg += `   ├ Fixas: ${formatCurrency(totalFixas)}\n`;
        msg += `   └ Variáveis: ${formatCurrency(gastosVariaveis)}\n`;
        msg += `───────────────────\n`;
        msg += `⚖️ *Saldo Disp: ${formatCurrency(saldoPrevisto)}*\n`;
        msg += `Status: ${status}\n\n`;

        msg += `📂 *Detalhamento por Categoria*\n`;

        // Lógica de Exibição de Categorias
        // 1. Cria um mapa para acesso rápido aos nomes
        const catMap = {};
        categories?.forEach(c => catMap[c.id] = c);

        // 2. Identifica IDs que tiveram gastos mas não estão na lista de categorias (Ex: Categoria deletada)
        const idsComGasto = Object.keys(gastosPorCategoria).filter(id => id !== 'sem_categoria');
        
        let algumItemMostrado = false;

        // A. Categorias Conhecidas (com orçamento ou gasto)
        categories?.forEach(cat => {
            const gasto = gastosPorCategoria[cat.id] || 0;
            const limite = parseFloat(cat.budget || 0);

            if (limite > 0 || gasto > 0) {
                algumItemMostrado = true;
                msg += `\n🏷️ *${cat.name}*`;
                if (limite > 0) {
                    const restante = limite - gasto;
                    msg += drawBudgetBar(gasto, limite);
                    msg += `\n   ${formatCurrency(gasto)} / ${formatCurrency(limite)}`;
                    if (restante < 0) msg += ` (🚨 +${formatCurrency(Math.abs(restante))})`;
                } else {
                    msg += `\n   ${formatCurrency(gasto)} (Sem limite)`;
                }
            }
        });

        // B. Categorias Desconhecidas (Gastos órfãos)
        idsComGasto.forEach(id => {
            if (!catMap[id]) { // Se não está no mapa de categorias conhecidas
                algumItemMostrado = true;
                const valor = gastosPorCategoria[id];
                msg += `\n\n⚠️ *Outra Categoria:* ${formatCurrency(valor)}`;
                msg += `\n   _(Categoria ID: ...${id.slice(-4)})_`;
            }
        });

        // C. Sem Categoria
        if (gastosPorCategoria['sem_categoria']) {
            algumItemMostrado = true;
            msg += `\n\n⚠️ *Sem Categoria:* ${formatCurrency(gastosPorCategoria['sem_categoria'])}`;
        }

        if (!algumItemMostrado) {
            msg += `_Nenhuma movimentação neste mês._\n`;
        }

        ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });

    } catch (err) {
        console.error('Erro Dashboard:', err);
        ctx.reply('⚠️ Erro ao calcular.', MainMenu);
    }
};

// 2. EXTRATO
const getStatement = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    const { data } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10); // mudei ordem para created_at

    if (!data || data.length === 0) return ctx.reply('📭 Vazio.', MainMenu);

    let msg = '📄 *Extrato Recente:*\n\n';
    data.forEach(t => {
        const icon = t.type === 'expense' ? '🔻' : '🟢';
        // Tenta usar created_at se date for nulo
        const dataRef = t.date || t.created_at; 
        msg += `${icon} *${t.description}* — ${formatCurrency(Math.abs(t.amount))}\n📅 ${formatDate(dataRef)}\n\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });
};

module.exports = { getDashboard, getStatement };