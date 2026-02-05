const supabase = require('../config/supabase');
const { getAuthenticatedUser, formatCurrency, formatDate } = require('../utils/helpers');
const { MainMenu, LinkToWeb } = require('../utils/keyboards');

// Função visual: Cria a barra de progresso [████░░░░░░]
const drawBudgetBar = (spent, budget) => {
    if (!budget || budget <= 0) return ''; // Se não tem limite, não desenha barra
    
    const percentage = Math.min((spent / budget) * 100, 100);
    const filled = Math.round(percentage / 10); // 0 a 10 blocos
    const empty = 10 - filled;
    
    // Define a cor do ícone baseada no perigo
    let icon = '🟢';
    if (percentage >= 100) icon = '🔴'; // Estourou
    else if (percentage >= 80) icon = '⚠️'; // Alerta
    
    return `\n${icon} [${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage.toFixed(0)}%`;
};

// 1. DASHBOARD COMPLETO (Saldo + Orçamentos)
const getDashboard = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    if (!userId) return ctx.reply('🔒 Você precisa conectar sua conta. Digite /start para instruções.');

    // Datas para filtrar o mês atual
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();

    try {
        // --- ETAPA 1: BUSCAR DADOS ---

        // A. Salário Base (Tabela profiles)
        const { data: profile } = await supabase
            .from('profiles')
            .select('monthly_income')
            .eq('id', userId)
            .single();
        const salarioBase = parseFloat(profile?.monthly_income || 0);

        // B. Contas Recorrentes (Para somar no custo fixo)
        const { data: recurring } = await supabase
            .from('recurring_bills')
            .select('amount')
            .eq('user_id', userId)
            .eq('type', 'expense');
        const totalFixas = recurring?.reduce((acc, curr) => acc + parseFloat(curr.amount), 0) || 0;

        // C. Transações do Mês (Para calcular gastos variáveis)
        const { data: transactions } = await supabase
            .from('transactions')
            .select('amount, type, category_id')
            .eq('user_id', userId)
            .gte('date', primeiroDiaMes);

        // D. Categorias (Para ver os orçamentos/limites)
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name, budget')
            .or(`user_id.eq.${userId},user_id.is.null`);

        // --- ETAPA 2: PROCESSAR CÁLCULOS ---

        let ganhosExtras = 0;
        let gastosVariaveis = 0;
        const gastosPorCategoria = {}; // Acumulador: { id_categoria: valor_gasto }

        transactions?.forEach(t => {
            const val = parseFloat(t.amount);
            
            if (t.type === 'income') {
                ganhosExtras += Math.abs(val);
            } else {
                gastosVariaveis += Math.abs(val);
                
                // Soma para o controle de orçamento
                const catId = t.category_id || 'sem_categoria';
                gastosPorCategoria[catId] = (gastosPorCategoria[catId] || 0) + Math.abs(val);
            }
        });

        // Totais Gerais
        const receitaTotal = salarioBase + ganhosExtras;
        const despesaTotal = totalFixas + gastosVariaveis; 
        const saldoPrevisto = receitaTotal - despesaTotal;
        const status = saldoPrevisto >= 0 ? '🔵 No Azul' : '🔴 No Vermelho';

        // --- ETAPA 3: MONTAR O TEXTO ---

        let msg = `📊 *Painel Financeiro Mensal*\n\n`;

        // Bloco Resumo
        msg += `💵 *Receitas:* ${formatCurrency(receitaTotal)}\n`;
        msg += `   ├ Base: ${formatCurrency(salarioBase)}\n`;
        msg += `   └ Extras: ${formatCurrency(ganhosExtras)}\n`;
        
        msg += `\n📉 *Despesas:* ${formatCurrency(despesaTotal)}\n`;
        msg += `   ├ Fixas: ${formatCurrency(totalFixas)}\n`;
        msg += `   └ Variáveis: ${formatCurrency(gastosVariaveis)}\n`;
        
        msg += `───────────────────\n`;
        msg += `⚖️ *Saldo Disponível: ${formatCurrency(saldoPrevisto)}*\n`;
        msg += `Status: ${status}\n\n`;

        // Bloco Controle de Orçamentos (O que você pediu!)
        msg += `📂 *Controle de Orçamentos*\n`;
        
        let temOrcamento = false;

        if (categories && categories.length > 0) {
            // Filtra categorias que têm orçamento definido OU que tiveram gastos
            const catsAtivas = categories.filter(c => (c.budget && c.budget > 0) || gastosPorCategoria[c.id]);

            catsAtivas.forEach(cat => {
                const gasto = gastosPorCategoria[cat.id] || 0;
                const limite = parseFloat(cat.budget || 0);

                // Só mostra se tiver gasto ou limite
                if (limite > 0 || gasto > 0) {
                    temOrcamento = true;
                    msg += `\n🏷️ *${cat.name}*`;
                    
                    if (limite > 0) {
                        // Lógica completa: Barra + Valores + Restante
                        const restante = limite - gasto;
                        msg += drawBudgetBar(gasto, limite);
                        msg += `\n   Gasto: ${formatCurrency(gasto)} / ${formatCurrency(limite)}`;
                        
                        if (restante >= 0) {
                            msg += `\n   ✅ Restam: ${formatCurrency(restante)}`;
                        } else {
                            msg += `\n   🚨 Estourou: ${formatCurrency(Math.abs(restante))}`;
                        }
                    } else {
                        // Sem limite definido
                        msg += `\n   Gasto: ${formatCurrency(gasto)} (Sem teto)`;
                    }
                    msg += `\n`; // Espaçamento
                }
            });
        }

        // Gastos Sem Categoria
        if (gastosPorCategoria['sem_categoria']) {
            msg += `\n⚠️ *Sem Categoria:* ${formatCurrency(gastosPorCategoria['sem_categoria'])}\n`;
        }

        if (!temOrcamento && !gastosPorCategoria['sem_categoria']) {
            msg += `_Nenhuma movimentação ou orçamento ativo neste mês._\n`;
        }

        ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });

    } catch (err) {
        console.error('Erro Dashboard:', err);
        ctx.reply('⚠️ Ocorreu um erro ao calcular o painel. Tente novamente em instantes.', MainMenu);
    }
};

// 2. EXTRATO (Simples lista das últimas movimentações)
const getStatement = async (ctx) => {
    const userId = await getAuthenticatedUser(ctx.chat.id);
    
    const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(10); // Aumentei para 10 para ver mais histórico

    if (!data || data.length === 0) return ctx.reply('📭 Nenhuma movimentação recente.', MainMenu);

    let msg = '📄 *Extrato Recente:*\n\n';
    data.forEach(t => {
        const icon = t.type === 'expense' ? '🔻' : '🟢';
        const valor = Math.abs(parseFloat(t.amount));
        msg += `${icon} *${t.description}* — ${formatCurrency(valor)}\n`;
        msg += `📅 ${formatDate(t.date || t.created_at)}\n\n`;
    });
    
    ctx.reply(msg, { parse_mode: 'Markdown', ...LinkToWeb });
};

module.exports = { getDashboard, getStatement };