const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency, formatDate } = require('../utils/helpers');
const { MainMenu, LinkToWeb } = require('../utils/keyboards');

// Função visual: Barra de Progresso
const drawBudgetBar = (spent, limit) => {
    // Garante positivos
    const spentPos = Math.abs(spent);
    const limitPos = Math.abs(limit);

    if (!limitPos || limitPos <= 0) return ''; 
    
    const percentage = Math.min((spentPos / limitPos) * 100, 100);
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
        // --- 1. BUSCAR DADOS ---

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
        const totalFixas = recurring?.reduce((acc, curr) => acc + Math.abs(parseFloat(curr.amount)), 0) || 0;

        // C. Transações do Mês
        const { data: transactions } = await supabase
            .from('transactions')
            .select('amount, type, category_id')
            .eq('user_id', userId)
            .gte('created_at', dataInicioIso);

        // D. Categorias (Nomes)
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name') // Não pegamos budget aqui
            .or(`user_id.eq.${userId},user_id.is.null`);

        // E. ORÇAMENTOS (Tabela Separada 'budgets')
        // Aqui está a correção: buscamos o limite na tabela certa
        const { data: budgetsData } = await supabase
            .from('budgets')
            .select('category_id, limit_amount')
            .eq('user_id', userId);

        // --- 2. MAPEAMENTO DE DADOS ---

        // Mapa de Orçamentos: { ID_CATEGORIA: VALOR_LIMITE }
        const budgetMap = {};
        if (budgetsData) {
            budgetsData.forEach(b => {
                budgetMap[b.category_id] = parseFloat(b.limit_amount);
            });
        }

        // Mapa de Gastos por Categoria
        let ganhosExtras = 0;
        let gastosVariaveis = 0;
        const gastosPorCategoria = {};
        
        // Inicializa contadores para categorias conhecidas
        const catNames = {};
        categories?.forEach(c => {
            catNames[c.id] = c.name;
            gastosPorCategoria[c.id] = 0;
        });
        gastosPorCategoria['sem_categoria'] = 0;
        gastosPorCategoria['outra'] = 0;

        // Processa Transações
        transactions?.forEach(t => {
            const valAbsoluto = Math.abs(parseFloat(t.amount));

            if (t.type === 'income') {
                ganhosExtras += valAbsoluto;
            } else {
                gastosVariaveis += valAbsoluto;
                
                const catId = t.category_id;
                
                if (!catId) {
                    gastosPorCategoria['sem_categoria'] += valAbsoluto;
                } else if (catNames[catId]) {
                    gastosPorCategoria[catId] += valAbsoluto;
                } else {
                    gastosPorCategoria['outra'] += valAbsoluto;
                }
            }
        });

        // Totais Gerais
        const receitaTotal = salarioBase + ganhosExtras;
        const despesaTotal = totalFixas + gastosVariaveis; 
        const saldoPrevisto = receitaTotal - despesaTotal;
        const status = saldoPrevisto >= 0 ? '🔵 Azul' : '🔴 Vermelho';

        // --- 3. VISUALIZAÇÃO ---
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

        // Itera sobre todas as categorias disponíveis
        categories?.forEach(cat => {
            const gasto = gastosPorCategoria[cat.id] || 0;
            // Pega o limite do MAPA que criamos via tabela 'budgets'
            const limite = budgetMap[cat.id] || 0; 

            // Mostra se tiver Limite Definido OU Gasto realizado
            if (limite > 0 || gasto > 0) {
                algumItem = true;
                msg += `\n🏷️ *${cat.name}*`;
                
                if (limite > 0) {
                    const restante = limite - gasto;
                    msg += drawBudgetBar(gasto, limite);
                    msg += `\n   ${formatCurrency(gasto)} / ${formatCurrency(limite)}`;
                    
                    if (restante < 0) {
                        msg += ` (🚨 ${formatCurrency(restante)})`; // Valor negativo já tem sinal
                    } else {
                        msg += ` (✅ Restam ${formatCurrency(restante)})`;
                    }
                } else {
                    msg += `\n   ${formatCurrency(gasto)} (Sem limite)`;
                }
            }
        });

        // Gastos avulsos
        if (gastosPorCategoria['sem_categoria'] > 0) {
            algumItem = true;
            msg += `\n\n⚠️ *Sem Categoria:* ${formatCurrency(gastosPorCategoria['sem_categoria'])}`;
        }
        
        if (gastosPorCategoria['outra'] > 0) {
            algumItem = true;
            msg += `\n\n❓ *Outras:* ${formatCurrency(gastosPorCategoria['outra'])}`;
        }

        if (!algumItem) {
            msg += `_Nenhuma movimentação ou orçamento ativo._\n`;
        }

        ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });

    } catch (err) {
        console.error('Erro Dashboard:', err);
        ctx.reply('⚠️ Erro ao calcular dashboard.', MainMenu);
    }
};

// 2. EXTRATO (Mantido)
const getStatement = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    const { data } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);

    if (!data || data.length === 0) return ctx.reply('📭 Extrato vazio.', MainMenu);

    let msg = '📄 *Extrato Recente:*\n\n';
    data.forEach(t => {
        const icon = t.type === 'expense' ? '🔻' : '🟢';
        const dataRef = t.date || t.created_at; 
        msg += `${icon} *${t.description}* — ${formatCurrency(Math.abs(t.amount))}\n📅 ${formatDate(dataRef)}\n\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });
};

module.exports = { getDashboard, getStatement };