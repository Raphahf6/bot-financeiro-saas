const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency, formatDate } = require('../utils/helpers');
const { MainMenu, LinkToWeb } = require('../utils/keyboards');

// Função visual: Barra de Progresso
const drawBudgetBar = (spent, budget) => {
    // Garante que estamos lidando com números positivos para o desenho
    const spentPos = Math.abs(spent);
    const budgetPos = Math.abs(budget);

    if (!budgetPos || budgetPos <= 0) return ''; 
    
    const percentage = Math.min((spentPos / budgetPos) * 100, 100);
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

    // DATA: Início do mês atual
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
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
        // Soma garantindo positivo
        const totalFixas = recurring?.reduce((acc, curr) => acc + Math.abs(parseFloat(curr.amount)), 0) || 0;

        // C. Transações do Mês
        const { data: transactions } = await supabase
            .from('transactions')
            .select('amount, type, category_id')
            .eq('user_id', userId)
            .gte('created_at', dataInicioIso);

        // D. Categorias (Busca ID, Nome e Orçamento)
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name, budget')
            .or(`user_id.eq.${userId},user_id.is.null`);

        // --- PROCESSAMENTO ---
        let ganhosExtras = 0;
        let gastosVariaveis = 0;
        
        // Mapa para somar gastos por ID de categoria
        const gastosPorCategoria = {}; 
        
        // Mapa auxiliar para saber o nome da categoria pelo ID
        const catDetails = {}; 
        categories?.forEach(c => {
            catDetails[c.id] = c;
            // Inicializa o acumulador com 0 para todas as categorias existentes
            gastosPorCategoria[c.id] = 0;
        });
        // Inicializa acumulador para sem categoria
        gastosPorCategoria['sem_categoria'] = 0;

        transactions?.forEach(t => {
            const valOriginal = parseFloat(t.amount);
            const valAbsoluto = Math.abs(valOriginal); // <--- O SEGREDO: Sempre positivo para somas

            if (t.type === 'income') {
                ganhosExtras += valAbsoluto;
            } else {
                gastosVariaveis += valAbsoluto;
                
                // Agrupamento
                const catId = t.category_id;
                
                if (!catId) {
                    gastosPorCategoria['sem_categoria'] += valAbsoluto;
                } else if (catDetails[catId]) {
                    // Categoria existe na lista oficial
                    gastosPorCategoria[catId] += valAbsoluto;
                } else {
                    // Tem ID mas não está na lista (deletada ou erro de permissão)
                    if (!gastosPorCategoria['outra']) gastosPorCategoria['outra'] = 0;
                    gastosPorCategoria['outra'] += valAbsoluto;
                }
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

        msg += `📂 *Controle de Orçamentos*\n`;

        let algumItem = false;

        // 1. Itera sobre as categorias cadastradas
        categories?.forEach(cat => {
            const gasto = gastosPorCategoria[cat.id] || 0; // Já está positivo
            const limite = parseFloat(cat.budget || 0);

            // Só mostra se tiver Orçamento definido OU se gastou algo nela
            if (limite > 0 || gasto > 0) {
                algumItem = true;
                msg += `\n🏷️ *${cat.name}*`;
                
                if (limite > 0) {
                    const restante = limite - gasto;
                    msg += drawBudgetBar(gasto, limite);
                    msg += `\n   ${formatCurrency(gasto)} / ${formatCurrency(limite)}`;
                    
                    if (restante < 0) {
                        msg += ` (🚨 Estourou ${formatCurrency(Math.abs(restante))})`;
                    }
                } else {
                    msg += `\n   ${formatCurrency(gasto)} (Sem limite)`;
                }
            }
        });

        // 2. Gastos Sem Categoria
        if (gastosPorCategoria['sem_categoria'] > 0) {
            algumItem = true;
            msg += `\n\n⚠️ *Sem Categoria:* ${formatCurrency(gastosPorCategoria['sem_categoria'])}`;
        }

        // 3. Gastos em Categorias Desconhecidas (ID que não bateu)
        if (gastosPorCategoria['outra'] > 0) {
            algumItem = true;
            msg += `\n\n❓ *Categorias Deletadas/Outras:* ${formatCurrency(gastosPorCategoria['outra'])}`;
        }

        if (!algumItem) {
            msg += `_Nenhuma movimentação neste mês._\n`;
        }

        ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });

    } catch (err) {
        console.error('Erro Dashboard:', err);
        ctx.reply('⚠️ Erro ao calcular.', MainMenu);
    }
};

// 2. EXTRATO (Mantido)
const getStatement = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    const { data } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);

    if (!data || data.length === 0) return ctx.reply('📭 Vazio.', MainMenu);

    let msg = '📄 *Extrato Recente:*\n\n';
    data.forEach(t => {
        const icon = t.type === 'expense' ? '🔻' : '🟢';
        const dataRef = t.date || t.created_at; 
        msg += `${icon} *${t.description}* — ${formatCurrency(Math.abs(t.amount))}\n📅 ${formatDate(dataRef)}\n\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });
};

module.exports = { getDashboard, getStatement };