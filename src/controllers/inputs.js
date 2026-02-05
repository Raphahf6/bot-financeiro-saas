const supabase = require('../config/supabase');
const { getUserAuth, parseValue } = require('../utils/helpers');
const { guessCategory, getCategoryId } = require('../utils/categorizer');
const { InlineUndo } = require('../utils/keyboards');

async function handleMessage(ctx) {
  const text = ctx.message.text.trim();
  
  // Ignora comandos de barra (tratados no index.js) mas processa textos dos botões de menu
  if (text.startsWith('/') && !['/start', '/ajuda'].includes(text)) return;

  const userId = await getUserAuth(ctx);
  if (!userId) return ctx.reply('🔒 Olá! Para começar, vá no sistema web > Configurações > Telegram e pegue seu token.');

  // --- LÓGICA DE INTERPRETAÇÃO INTELIGENTE ---
  
  // 1. Detectar GASTO (g 50 pizza / gastei 50 na padaria / 50 padaria)
  // Regex flexível: aceita "g", "gastei", "comprei" ou começa direto com numero
  const matchGasto = text.match(/^(?:g|gastei|comprei|paguei)?\s*R?\$?\s*(\d+(?:[.,]\d{1,2})?)\s+(?:em|no|na)?\s*(.*)/i);
  
  // 2. Detectar GANHO (r 1000 salario / ganhei 50 pix)
  const matchReceita = text.match(/^(?:r|receita|ganhei|recebi|entrada)\s*R?\$?\s*(\d+(?:[.,]\d{1,2})?)\s+(?:de)?\s*(.*)/i);

  // --- PROCESSAMENTO ---

  // CASO: GASTO
  if (matchGasto && !text.match(/^(?:r|receita|ganhei|recebi)/i)) { 
    const amount = parseValue(matchGasto[1]);
    const description = matchGasto[2] || 'Geral';
    
    const catName = await guessCategory(description);
    const catId = await getCategoryId(catName);

    const { data, error } = await supabase.from('transactions').insert({
      user_id: userId,
      description,
      amount,
      type: 'expense',
      category_id: catId,
      date: new Date().toISOString()
    }).select().single();

    if (error) return ctx.reply("❌ Ops, erro ao salvar.");

    return ctx.reply(
      `💸 **Gasto de R$ ${amount.toFixed(2)}**\n` +
      `🏷️ *${description}* (${catName})`, 
      { parse_mode: 'Markdown', ...InlineUndo(data.id) }
    );
  }

  // CASO: RECEITA
  if (matchReceita) {
    const amount = parseValue(matchReceita[1]);
    const description = matchReceita[2] || 'Entrada';

    const { data, error } = await supabase.from('transactions').insert({
      user_id: userId,
      description,
      amount,
      type: 'income',
      category_id: null,
      date: new Date().toISOString()
    }).select().single();

    if (error) return ctx.reply("❌ Ops, erro ao salvar.");

    return ctx.reply(
      `💰 **Entrada de R$ ${amount.toFixed(2)}**\n` +
      `🏷️ *${description}*`, 
      { parse_mode: 'Markdown', ...InlineUndo(data.id) }
    );
  }

  // Se não entendeu nada, mas não é um comando do menu
  if (!['📉 Registrar Gasto', '📈 Registrar Ganho', '📊 Ver Saldo', '📝 Extrato', '🎯 Metas', '❓ Ajuda'].includes(text)) {
    ctx.reply(
      "🤔 Não entendi. Tente algo como:\n\n" +
      "• `50 almoço` (Gasto)\n" +
      "• `ganhei 100 pix` (Receita)\n" +
      "• Ou use o menu abaixo 👇", 
      { parse_mode: 'Markdown' }
    );
  }
}

module.exports = { handleMessage };