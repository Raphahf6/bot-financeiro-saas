const supabase = require('../config/supabase');
const { ReportMenu, ExtractMenu, GoalsListMenu } = require('../utils/keyboards');

// Ver Saldo
const handleBalance = async (ctx) => {
  const userId = ctx.session.userId;
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Busca transações do mês
  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, type')
    .eq('user_id', userId)
    .gte('date', startMonth);

  let income = 0, expense = 0;
  if(transactions) {
    transactions.forEach(t => t.type === 'income' ? income += Number(t.amount) : expense += Number(t.amount));
  }
  
  const balance = income - expense;

  await ctx.reply(
    `💰 **Balanço de ${now.toLocaleString('pt-BR', { month: 'long' })}**\n\n` +
    `🟢 Entradas: R$ ${income.toFixed(2)}\n` +
    `🔴 Saídas:   R$ ${expense.toFixed(2)}\n` +
    `───────────────\n` +
    `💵 **Saldo:   R$ ${balance.toFixed(2)}**\n\n` +
    `_Para análises detalhadas, acesse o painel web._`,
    { parse_mode: 'Markdown', ...ReportMenu }
  );
};

// Ver Extrato
const handleExtract = async (ctx) => {
  const userId = ctx.session.userId;
  
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*, categories(name)')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(10);

  if (!transactions || transactions.length === 0) {
    return ctx.reply("📭 Nenhuma movimentação recente.", { ...ExtractMenu });
  }

  let msg = `📄 **Últimos 10 Lançamentos**\n\n`;
  
  transactions.forEach(t => {
    const icon = t.type === 'income' ? '🟢' : '🔴';
    const cat = t.categories?.name ? `_${t.categories.name}_` : '';
    const val = Number(t.amount).toFixed(2);
    const date = new Date(t.date).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
    
    msg += `${icon} **R$ ${val}** • ${t.description} ${cat}\n   📅 ${date}\n\n`;
  });

  await ctx.reply(msg, { parse_mode: 'Markdown', ...ExtractMenu });
};

// Ver Metas
const handleGoals = async (ctx) => {
  const userId = ctx.session.userId;
  const { data: goals } = await supabase.from('goals').select('*').eq('user_id', userId);

  if (!goals || goals.length === 0) {
    return ctx.reply("🎯 Você não tem metas ativas.", { parse_mode: 'Markdown' });
  }

  let msg = "🎯 **Suas Metas:**\n\n";
  goals.forEach(g => {
    const pct = Math.round((g.current_amount / g.target_amount) * 100);
    msg += `• *${g.name}*: R$ ${g.current_amount} / ${g.target_amount} (${pct}%)\n`;
  });

  await ctx.reply(msg, { parse_mode: 'Markdown', ...GoalsListMenu(goals) });
};

// Ver Contas Fixas
const handleBills = async (ctx) => {
  const userId = ctx.session.userId;
  const today = new Date().getDate();
  
  const { data: bills } = await supabase
    .from('recurring_bills')
    .select('*')
    .eq('user_id', userId)
    .order('due_day', { ascending: true });

  if (!bills || bills.length === 0) return ctx.reply("📅 Nenhuma conta fixa cadastrada.");

  let msg = "📅 **Contas Fixas do Mês:**\n\n";
  bills.forEach(b => {
    const icon = b.due_day === today ? '⚠️' : b.due_day < today ? '✅' : '⏳';
    msg += `${icon} Dia ${b.due_day}: **${b.description}** (R$ ${Number(b.amount).toFixed(2)})\n`;
  });

  ctx.reply(msg, { parse_mode: 'Markdown' });
};

module.exports = { handleBalance, handleExtract, handleGoals, handleBills };