const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency, formatDate } = require('../utils/helpers');
const { DashboardMenu, DASHBOARD_URL } = require('../utils/keyboards');

const drawBudgetBar = (spent, limit) => {
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

const getDashboard = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Conecte sua conta com /start.');

    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    primeiroDia.setHours(0, 0, 0, 0);
    const dataInicioIso = primeiroDia.toISOString();

    try {
        // --- 1. BUSCAR DADOS ---

        // A. Perfil
        const { data: profile } = await supabase
            .from('profiles')
            .select('monthly_income')
            .eq('id', userId)
            .single();
        const salarioBase = parseFloat(profile?.monthly_income || 0);

        // B. Contas Mensais (Recorrentes) - AGORA PEGAMOS A CATEGORIA TAMBÉM
        const { data: recurring } = await supabase
            .from('recurring_bills')
            .select('amount, category_id') // <--- Importante: trazer category_id
            .eq('user_id', userId)
            .eq('type', 'expense');
        
        // Soma total das fixas para o resumo geral
        const totalFixas = recurring?.reduce((acc, curr) => acc + Math.abs(parseFloat(curr.amount)), 0) || 0;

        // C. Transações Variáveis do Mês
        const { data: transactions } = await supabase
            .from('transactions')
            .select('amount, type, category_id')
            .eq('user_id', userId)
            .gte('created_at', dataInicioIso);

        // D. Categorias
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name')
            .or(`user_id.eq.${userId},user_id.is.null`);

        // E. Orçamentos
        const { data: budgetsData } = await supabase
            .from('budgets')
            .select('category_id, limit_amount')
            .eq('user_id', userId);

        // --- 2. PROCESSAMENTO E SOMAS ---

        const budgetMap = {};
        if (budgetsData) {
            budgetsData.forEach(b => budgetMap[b.category_id] = parseFloat(b.limit_amount));
        }

        let ganhosExtras = 0;
        let gastosVariaveisTotal = 0;
        const gastosPorCategoria = {}; // Acumula Fixas + Variáveis
        
        // Mapeamento de nomes de categorias
        const catNames = {};
        categories?.forEach(c => {
            catNames[c.id] = c.name;
            gastosPorCategoria[c.id] = 0;
        });
        gastosPorCategoria['sem_categoria'] = 0;
        gastosPorCategoria['outra'] = 0;

        // 2.1. SOMAR TRANSAÇÕES (Gastos Variáveis)
        transactions?.forEach(t => {
            const valAbsoluto = Math.abs(parseFloat(t.amount));

            if (t.type === 'income') {
                ganhosExtras += valAbsoluto;
            } else {
                gastosVariaveisTotal += valAbsoluto;
                
                const catId = t.category_id;
                if (!catId) gastosPorCategoria['sem_categoria'] += valAbsoluto;
                else if (catNames[catId]) gastosPorCategoria[catId] += valAbsoluto;
                else gastosPorCategoria['outra'] += valAbsoluto;
            }
        });

        // 2.2. SOMAR CONTAS MENSAIS (Gastos Fixos) NA CATEGORIA
        // Aqui está a correção: A conta fixa consome o orçamento da categoria!
        recurring?.forEach(bill => {
            const valAbsoluto = Math.abs(parseFloat(bill.amount));
            const catId = bill.category_id;

            if (catId) {
                if (catNames[catId]) {
                    gastosPorCategoria[catId] += valAbsoluto;
                } else {
                    // Se tem ID mas não achou o nome (categoria oculta/deletada), soma em 'outra'
                    // Ou podemos optar por não somar na categoria se preferir, mas somar é mais seguro
                     gastosPorCategoria['outra'] += valAbsoluto;
                }
            } else {
                gastosPorCategoria['sem_categoria'] += valAbsoluto;
            }
        });

        // Totais Gerais
        const receitaTotal = salarioBase + ganhosExtras;
        const despesaTotal = totalFixas + gastosVariaveisTotal; 
        const saldoPrevisto = receitaTotal - despesaTotal;
        const status = saldoPrevisto >= 0 ? '🔵 Azul' : '🔴 Vermelho';

        // --- 3. VISUALIZAÇÃO ---

        let msg = `📊 *[Resumo Financeiro Mensal](${DASHBOARD_URL})*\n\n`;
        
        msg += `💵 *Receitas:* ${formatCurrency(receitaTotal)}\n`;
        msg += `   ├ Base: ${formatCurrency(salarioBase)}\n`;
        msg += `   └ Extras: ${formatCurrency(ganhosExtras)}\n`;
        
        msg += `\n📉 *Despesas:* ${formatCurrency(despesaTotal)}\n`;
        msg += `   ├ Fixas (Mensais): ${formatCurrency(totalFixas)}\n`;
        msg += `   └ Variáveis (Extras): ${formatCurrency(gastosVariaveisTotal)}\n`;
        
        msg += `───────────────────\n`;
        msg += `⚖️ *Saldo Previsto: ${formatCurrency(saldoPrevisto)}*\n`;
        msg += `Status: ${status}\n\n`;

        msg += `📂 *Controle de Orçamentos*\n_Inclui gastos variáveis + contas mensais_\n`;

        let algumItem = false;

        categories?.forEach(cat => {
            const gastoTotal = gastosPorCategoria[cat.id] || 0; // Soma (Fixa + Variável)
            const limite = budgetMap[cat.id] || 0; 

            if (limite > 0 || gastoTotal > 0) {
                algumItem = true;
                msg += `\n🏷️ *${cat.name}*`;
                
                if (limite > 0) {
                    const restante = limite - gastoTotal;
                    msg += drawBudgetBar(gastoTotal, limite);
                    msg += `\n   ${formatCurrency(gastoTotal)} / ${formatCurrency(limite)}`;
                    if (restante < 0) msg += ` (🚨 ${formatCurrency(restante)})`;
                    else msg += ` (✅ Restam ${formatCurrency(restante)})`;
                } else {
                    msg += `\n   ${formatCurrency(gastoTotal)} (Sem limite)`;
                }
            }
        });

        if (gastosPorCategoria['sem_categoria'] > 0) {
            algumItem = true;
            msg += `\n\n⚠️ *Sem Categoria:* ${formatCurrency(gastosPorCategoria['sem_categoria'])}`;
        }
        if (gastosPorCategoria['outra'] > 0) {
            algumItem = true;
            msg += `\n\n❓ *Outras:* ${formatCurrency(gastosPorCategoria['outra'])}`;
        }

        if (!algumItem) msg += `_Sem dados para este mês._\n`;

        ctx.reply(msg, { parse_mode: 'Markdown', ...DashboardMenu });

    } catch (err) {
        console.error('Erro Dashboard:', err);
        ctx.reply('⚠️ Erro ao calcular.', DashboardMenu);
    }
};

const getStatement = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    const { data } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);

    if (!data || data.length === 0) return ctx.reply('📭 Extrato vazio.', DashboardMenu);

    let msg = '📄 *Extrato Recente:*\n\n';
    data.forEach(t => {
        const icon = t.type === 'expense' ? '🔻' : '🟢';
        const dataRef = t.date || t.created_at; 
        msg += `${icon} *${t.description}* — ${formatCurrency(Math.abs(t.amount))}\n📅 ${formatDate(dataRef)}\n\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown', ...DashboardMenu });
};

module.exports = { getDashboard, getStatement };