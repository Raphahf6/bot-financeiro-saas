const supabase = require('../config/supabase');
const { getUserAuth } = require('../utils/helpers');

// --- CALLBACK: DESFAZER TRANSAÇÃO ---
async function handleCallbackUndo(ctx) {
  const transactionId = ctx.match[1];
  
  // Apaga a transação pelo ID
  const { error } = await supabase.from('transactions').delete().eq('id', transactionId);
  
  if (error) {
    return ctx.answerCbQuery('❌ Erro ao desfazer.');
  }

  // Edita a mensagem original para mostrar que foi apagado
  ctx.editMessageText(`🗑️ **Transação apagada com sucesso!**`, { parse_mode: 'Markdown' });
  ctx.answerCbQuery('Desfeito!');
}

// --- COMANDO: SALDO ---
async function handleSaldo(ctx) {
  const userId = await getUserAuth(ctx);
  if (!userId) return ctx.reply('🔒 Autentique-se primeiro.');

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
  
  const { data: trs } = await supabase
    .from('transactions')
    .select('amount, type')
    .eq('user_id', userId)
    .gte('date', inicioMes);

  let entradas = 0, saidas = 0;
  trs.forEach(t => t.type === 'income' ? entradas += Number(t.amount) : saidas += Number(t.amount));
  const saldo = entradas - saidas;

  ctx.reply(
    `📊 **Resumo de ${hoje.toLocaleString('default', { month: 'long' })}**\n\n` +
    `🟢 Entradas:  R$ ${entradas.toFixed(2)}\n` +
    `🔴 Saídas:    R$ ${saidas.toFixed(2)}\n` +
    `───────────────\n` +
    `💰 **Saldo:    R$ ${saldo.toFixed(2)}**`,
    { parse_mode: 'Markdown' }
  );
}

// --- COMANDO: EXTRATO ---
async function handleExtrato(ctx) {
  const userId = await getUserAuth(ctx);
  if (!userId) return;

  const { data: trs } = await supabase
    .from('transactions')
    .select('*, categories(name)')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(10); // Mostra os últimos 10

  if (!trs?.length) return ctx.reply("📭 Nenhuma movimentação recente.");

  let msg = `📝 **Últimas 10 Movimentações:**\n\n`;
  trs.forEach(t => {
    const icon = t.type === 'income' ? '🟢' : '🔴';
    const cat = t.categories?.name ? `(${t.categories.name})` : '';
    const date = new Date(t.date).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
    
    msg += `${icon} *R$ ${Number(t.amount).toFixed(2)}* • ${t.description} ${cat}\n🗓️ ${date}\n\n`;
  });

  ctx.reply(msg, { parse_mode: 'Markdown' });
}

module.exports = { handleSaldo, handleExtrato, handleCallbackUndo };