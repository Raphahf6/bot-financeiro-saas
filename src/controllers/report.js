const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency, formatDate } = require('../utils/helpers');
const { MainMenu, LinkToWeb } = require('../utils/keyboards');

const drawBudgetBar = (spent, budget) => {
    if (!budget || budget === 0) return '';
    const percentage = Math.min((spent / budget) * 100, 100);
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    const icon = percentage >= 100 ? '🔴' : (percentage >= 80 ? '⚠️' : '🟢');
    return `\n${icon} [${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage.toFixed(0)}%`;
};

const getDashboard = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte-se com /start.');

    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();

    try {
        // 1. SALÁRIO BASE (Profile)
        const { data: profile } = await supabase
            .from('profiles')
            .select('monthly_income')
            .eq('id', userId)
            .single();
        const salarioBase = parseFloat(profile?.monthly_income || 0);

        // 2. CONTAS RECORRENTES (recurring_bills)
        // Somamos todas que são do tipo 'expense'
        const { data: recurring } = await supabase
            .from('recurring_bills')
            .select('amount')
            .eq('user_id', userId)
            .eq('type', 'expense');
            
        const totalFixas = recurring?.reduce((acc, curr) => acc + parseFloat(curr.amount), 0) || 0;

        // 3. TRANSAÇÕES VARIÁVEIS DO MÊS
        const { data: transactions } = await supabase
            .from('transactions')
            .select('amount, type, category_id')
            .eq('user_id', userId)
            .gte('date', primeiroDiaMes);

        // 4. CATEGORIAS (Orçamento)
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name, budget')
            .or(`user_id.eq.${userId},user_id.is.null`);

        // CÁLCULOS
        let ganhosExtras = 0;
        let gastosVariaveis = 0;
        const gastosPorCategoria = {}; 

        transactions?.forEach(t => {
            const val = parseFloat(t.amount);
            if (t.type === 'income') {
                ganhosExtras += Math.abs(val);
            } else {
                gastosVariaveis += Math.abs(val);
                
                // Agrupamento
                if (t.category_id) {
                    gastosPorCategoria[t.category_id] = (gastosPorCategoria[t.category_id] || 0) + Math.abs(val);
                } else {
                    gastosPorCategoria['sem_categoria'] = (gastosPorCategoria['sem_categoria'] || 0) + Math.abs(val);
                }
            }
        });

        // TOTAIS
        const receitaTotal = salarioBase + ganhosExtras;
        
        // Despesa Total = Fixas (que vão cair no mês) + Variáveis (que já gastei)
        const despesaTotal = totalFixas + gastosVariaveis; 
        
        const saldoPrevisto = receitaTotal - despesaTotal;
        const status = saldoPrevisto >= 0 ? '🔵 No Azul' : '🔴 No Vermelho';

        // RELATÓRIO
        let msg = `📊 *Resumo Financeiro (Mês Atual)*\n\n`;
        
        msg += `💵 *Receitas:* ${formatCurrency(receitaTotal)}\n`;
        msg += `   ├ Base: ${formatCurrency(salarioBase)}\n`;
        msg += `   └ Extras: ${formatCurrency(ganhosExtras)}\n\n`;
        
        msg += `📉 *Despesas:* ${formatCurrency(despesaTotal)}\n`;
        msg += `   ├ Fixas Recorrentes: ${formatCurrency(totalFixas)}\n`;
        msg += `   └ Variáveis Lançadas: ${formatCurrency(gastosVariaveis)}\n`;
        msg += `-----------------------------\n`;
        msg += `⚖️ *Saldo Disponível: ${formatCurrency(saldoPrevisto)}*\n`;
        msg += `Status: ${status}\n\n`;

        // Controle de Categorias
        msg += `📂 *Controle de Orçamentos*\n`;
        if (categories && categories.length > 0) {
            const catsAtivas = categories.filter(c => c.budget > 0 || gastosPorCategoria[c.id] > 0);
            
            if (catsAtivas.length === 0) msg += `_Nenhum orçamento definido._\n`;

            catsAtivas.forEach(cat => {
                const gasto = gastosPorCategoria[cat.id] || 0;
                const limite = parseFloat(cat.budget || 0);
                
                if (limite > 0 || gasto > 0) {
                    msg += `\n🏷️ *${cat.name}*`;
                    if (limite > 0) {
                        msg += drawBudgetBar(gasto, limite);
                        msg += `\n   ${formatCurrency(gasto)} / ${formatCurrency(limite)}`;
                    } else {
                        msg += `\n   ${formatCurrency(gasto)} (Sem limite)`;
                    }
                }
            });
        }
        
        if (gastosPorCategoria['sem_categoria'] > 0) {
            msg += `\n\n⚠️ *Sem Categoria:* ${formatCurrency(gastosPorCategoria['sem_categoria'])}`;
        }

        ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });

    } catch (err) {
        console.error('Erro Dashboard:', err);
        ctx.reply('⚠️ Erro ao gerar relatório.', MainMenu);
    }
};

const getStatement = async (ctx) => {
    // Mantém a função de extrato inalterada
    const userId = await getAuthenticatedUser(ctx.chat.id);
    const { data } = await supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(5);
    if (!data || data.length === 0) return ctx.reply('📭 Sem movimentações.');
    let msg = '📄 *Últimas Movimentações:*\n\n';
    data.forEach(t => {
        const icon = t.type === 'expense' ? '🔻' : '🟢';
        msg += `${icon} *${formatCurrency(Math.abs(t.amount))}* - ${t.description}\n📅 ${formatDate(t.date)}\n\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });
};

module.exports = { getDashboard, getStatement };