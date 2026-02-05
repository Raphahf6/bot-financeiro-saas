const supabase = require('../config/supabase');
const { getUserAuth } = require('../utils/helpers');

// /saldo
async function handleSaldo(ctx) {
  const userId = await getUserAuth(ctx);
  if (!userId) return;

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
  
  const { data: trs } = await supabase.from('transactions').select('amount, type').eq('user_id', userId).gte('date', inicioMes);
  const { data: profile } = await supabase.from('profiles').select('monthly_income').eq('id', userId).single();
  
  let rec = 0, desp = 0;
  trs.forEach(t => t.type === 'income' ? rec += Number(t.amount) : desp += Number(t.amount));
  
  ctx.reply(
    `📊 **Resumo Mensal**\n\n` +
    `🎯 Meta Renda: R$ ${profile?.monthly_income || 0}\n` +
    `🟢 Entradas: R$ ${rec.toFixed(2)}\n` +
    `🔴 Saídas: R$ ${desp.toFixed(2)}\n` +
    `────────────────\n` +
    `💵 **Saldo: R$ ${(rec - desp).toFixed(2)}**`
  );
}

// /contas
async function handleContas(ctx) {
  const userId = await getUserAuth(ctx);
  if (!userId) return;

  const dia = new Date().getDate();
  const { data: bills } = await supabase.from('recurring_bills').select('*').eq('user_id', userId).gte('due_day', dia).order('due_day').limit(5);
  
  if (!bills?.length) return ctx.reply("✅ Nenhuma conta próxima.");
  
  let msg = `📅 **Próximas Contas:**\n\n`;
  bills.forEach(b => msg += `• Dia ${b.due_day}: ${b.description} (R$ ${b.amount})\n`);
  ctx.reply(msg);
}

// /extrato
async function handleExtrato(ctx) {
  const userId = await getUserAuth(ctx);
  if (!userId) return;

  const { data: trs } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5);
  
  if (!trs?.length) return ctx.reply("📭 Sem movimentações.");
  
  let msg = `📝 **Últimos Lançamentos:**\n\n`;
  trs.forEach(t => {
    const icon = t.type === 'income' ? '🟢' : '🔴';
    msg += `${icon} ${t.description} (R$ ${t.amount})\n`;
  });
  ctx.reply(msg);
}

// /desfazer
async function handleDesfazer(ctx) {
  const userId = await getUserAuth(ctx);
  if (!userId) return;
  
  const { data: last } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).single();
  
  if (!last) return ctx.reply("🚫 Nada para apagar.");
  
  await supabase.from('transactions').delete().eq('id', last.id);
  ctx.reply(`🗑️ **Apagado:** ${last.description} (R$ ${last.amount})`);
}

module.exports = { handleSaldo, handleContas, handleExtrato, handleDesfazer };