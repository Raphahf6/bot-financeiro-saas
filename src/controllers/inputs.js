const supabase = require('../config/supabase');
const { getUserAuth, parseValue } = require('../utils/helpers');
const { guessCategory, getCategoryId } = require('../utils/categories');

async function handleMessage(ctx) {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return; // Ignora comandos
  
  const userId = await getUserAuth(ctx);
  if (!userId) return ctx.reply('🔒 Use /start SEU-TOKEN');

  // --- REGEX 1: GASTOS (g 50 pizza) ---
  const matchGasto = text.match(/^(?:g|gasto)\s+(\d+(?:[.,]\d{1,2})?)\s+(.*)/i);
  if (matchGasto) {
    const amount = parseValue(matchGasto[1]);
    const description = matchGasto[2];
    const catName = await guessCategory(description);
    const catId = await getCategoryId(catName);

    const { error } = await supabase.from('transactions').insert({
      user_id: userId, description, amount, type: 'expense', category_id: catId, date: new Date().toISOString()
    });

    if (error) return ctx.reply("❌ Erro ao salvar.");
    return ctx.reply(`💸 **Gasto Registrado!**\n📝 ${description}\n💲 R$ ${amount.toFixed(2)}\n📂 Categoria: ${catName}`);
  }

  // --- REGEX 2: RECEITAS (r 500 freela) ---
  const matchReceita = text.match(/^(?:r|receita|ganhei)\s+(\d+(?:[.,]\d{1,2})?)\s+(.*)/i);
  if (matchReceita) {
    const amount = parseValue(matchReceita[1]);
    const description = matchReceita[2];
    
    const { error } = await supabase.from('transactions').insert({
      user_id: userId, description, amount, type: 'income', category_id: null, date: new Date().toISOString()
    });

    if (error) return ctx.reply("❌ Erro ao salvar.");
    return ctx.reply(`💰 **Receita Registrada!**\n📝 ${description}\n💲 R$ ${amount.toFixed(2)}`);
  }

  // --- REGEX 3: NOVA META (nm 5000 Carro) ---
  const matchNovaMeta = text.match(/^(?:nm|nova meta)\s+(\d+(?:[.,]\d{1,2})?)\s+(.*)/i);
  if (matchNovaMeta) {
    const target = parseValue(matchNovaMeta[1]);
    const title = matchNovaMeta[2];
    
    const { error } = await supabase.from('goals').insert({
      user_id: userId, title, target_amount: target, current_amount: 0
    });
    
    if (error) return ctx.reply("❌ Erro ao criar meta.");
    return ctx.reply(`🎯 **Meta Criada!**\nObjetivo: ${title}\nAlvo: R$ ${target.toFixed(2)}`);
  }

  // --- REGEX 4: DEPOSITO META (m 100 Carro) ---
  const matchDeposito = text.match(/^(?:m|meta|guardar)\s+(\d+(?:[.,]\d{1,2})?)\s+(.*)/i);
  if (matchDeposito) {
    const amount = parseValue(matchDeposito[1]);
    const goalName = matchDeposito[2];
    
    const { data: goals } = await supabase.from('goals').select('*').eq('user_id', userId).ilike('title', `%${goalName}%`).limit(1);
    
    if (!goals?.length) return ctx.reply(`⚠️ Meta "${goalName}" não encontrada.`);
    
    const meta = goals[0];
    const novoValor = Number(meta.current_amount) + amount;
    
    await supabase.from('goals').update({ current_amount: novoValor }).eq('id', meta.id);
    const pct = meta.target_amount > 0 ? (novoValor / meta.target_amount * 100).toFixed(1) : 0;
    
    return ctx.reply(`🏦 **Guardado!**\nMeta: ${meta.title}\n+ R$ ${amount}\nTotal: R$ ${novoValor} (${pct}%)`);
  }

  ctx.reply("❓ Não entendi. Use: `g 50 pizza`, `r 100 venda` ou /ajuda.");
}

module.exports = { handleMessage };