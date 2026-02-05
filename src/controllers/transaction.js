const supabase = require('../config/supabase');
const { detectCategory } = require('../utils/categorizer');
const { AfterTransactionMenu } = require('../utils/keyboards');

// Regex flexível para capturar valores e descrições
const EXPENSE_REGEX = /^(?:g|gastei|paguei|comprei)?\s*R?\$?\s*(\d+(?:[.,]\d{1,2})?)\s+(?:no|na|em)?\s*(.*)/i;
const INCOME_REGEX = /^(?:r|receita|ganhei|recebi)\s*R?\$?\s*(\d+(?:[.,]\d{1,2})?)\s+(?:de)?\s*(.*)/i;

const handleMessage = async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.session.userId;

  // Ignora se for comando de menu
  if (['📉 Novo Gasto', '📈 Nova Entrada', '💰 Ver Saldo', '📄 Extrato', '🎯 Metas', '📅 Contas Fixas'].includes(text)) return;

  // 1. Identificar Receita
  const incomeMatch = text.match(INCOME_REGEX);
  if (incomeMatch) {
    const amount = parseFloat(incomeMatch[1].replace(',', '.'));
    const description = incomeMatch[2] || 'Entrada Avulsa';

    const { data, error } = await supabase.from('transactions').insert({
      user_id: userId, amount, description, type: 'income', date: new Date().toISOString()
    }).select().single();

    if (error) return ctx.reply('❌ Erro ao salvar receita.');

    return ctx.reply(
      `📈 **Receita de R$ ${amount.toFixed(2)} salva!**\n📝 Descrição: ${description}`,
      { parse_mode: 'Markdown', ...AfterTransactionMenu(data.id) }
    );
  }

  // 2. Identificar Gasto
  const expenseMatch = text.match(EXPENSE_REGEX);
  if (expenseMatch) {
    const amount = parseFloat(expenseMatch[1].replace(',', '.'));
    const description = expenseMatch[2] || 'Geral';
    const category = await detectCategory(description);

    const { data, error } = await supabase.from('transactions').insert({
      user_id: userId,
      amount,
      description,
      type: 'expense',
      category_id: category.id,
      date: new Date().toISOString()
    }).select().single();

    if (error) return ctx.reply('❌ Erro ao salvar gasto.');

    return ctx.reply(
      `📉 **Gasto de R$ ${amount.toFixed(2)} salvo!**\n` + 
      `📂 Categoria: *${category.name}*\n` +
      `📝 Item: ${description}`,
      { parse_mode: 'Markdown', ...AfterTransactionMenu(data.id) }
    );
  }
};

const undoTransaction = async (ctx) => {
  try {
    const id = ctx.match[1].replace('undo_', '');
    await supabase.from('transactions').delete().eq('id', id);
    await ctx.answerCbQuery('Transação apagada! 🗑️');
    await ctx.editMessageText('✅ **Registro desfeito com sucesso.**', { parse_mode: 'Markdown' });
  } catch (error) {
    console.error(error);
    await ctx.answerCbQuery('Erro ao desfazer.');
  }
};

module.exports = { handleMessage, undoTransaction };