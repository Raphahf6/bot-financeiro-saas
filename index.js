require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cron = require('node-cron');
const http = require('http'); // <--- IMPORTANTE: Módulo nativo para criar o servidor fake

// --- 1. VALIDAÇÃO ---
const REQUIRED_VARS = ['TELEGRAM_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'GEMINI_API_KEY'];
REQUIRED_VARS.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ ERRO FATAL: Faltando ${key} no .env`);
    process.exit(1);
  }
});

// --- 2. INICIALIZAÇÃO ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

console.log('🚀 Bot Financeiro (Versão Render Fix) Iniciado...');

// --- 3. MENU DE AJUDA ---
const ajudaMenu = {
  text: `🎓 **Central do Coach Financeiro**\n\nEstou online e estável!\n\nSelecione:`,
  buttons: Markup.inlineKeyboard([
    [Markup.button.callback('🎯 Criar/Gerir Metas', 'help_metas')],
    [Markup.button.callback('💸 Lançar Gasto', 'help_gastos')],
    [Markup.button.callback('💰 Lançar Ganho', 'help_ganhos')],
    [Markup.button.callback('📊 Minha Saúde', 'help_consultas')],
    [Markup.button.callback('🔙 Fechar', 'help_close')]
  ])
};

// --- 4. ROTEADOR ---
async function rotearIntencao(texto) {
  const t = texto.toLowerCase();
  if (t.match(/(nova meta|criar meta|definir meta)/)) return { intent: 'CREATE_GOAL' };
  if (t.match(/(guardar|investir|depositar|pôr|colocar).*meta/)) return { intent: 'ADD_TO_GOAL' };
  if (t.match(/(saldo|resumo|quanto.*gastei|gastos.*mes|fatura|balan[çc]o|saude|saúde)/)) return { intent: 'CHECK_BALANCE' };
  if (t.match(/(conta|boleto|pagar|vencendo|vence|hoje|amanh[ãa])/)) return { intent: 'CHECK_BILLS' };
  if (t.match(/(apaga|exclui|deleta|desfaz|remover|tira).*ultim[oa]/)) return { intent: 'DELETE_LAST' };
  if (t.match(/^(oi|ol[áa]|bom dia|boa tarde|boa noite|eai|opa)$/)) return { intent: 'CHAT_LOCAL', reply: "Olá! 👋 Sou seu Coach. Tudo pronto por aqui!" };
  return { intent: 'USE_AI' };
}

// --- 5. CÉREBRO IA ---
async function processarComIA(mensagemTexto) {
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const prompt = `
    Hoje: ${dataHoje}. Analise: "${mensagemTexto}".
    Intents: ADD_TRANSACTION, CREATE_GOAL, ADD_TO_GOAL, DELETE_LAST, CHAT.
    Output JSON ONLY.
    Structure: { "intent": "STRING", "data": { ...fields }, "reply_text": "STRING" }
    Fields for ADD_TRANSACTION: type(expense/income), amount, description, category_guess, smart_comment.
    Fields for CREATE_GOAL: title, target_amount.
    Fields for ADD_TO_GOAL: goal_name_guess, amount.
  `;

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text().replace(/```json|```/g, '').trim();
    const json = JSON.parse(text);
    ['amount', 'target_amount'].forEach(f => {
        if (json.data?.[f] && typeof json.data[f] === 'string') json.data[f] = parseFloat(json.data[f].replace(/[^\d.,]/g, '').replace(',', '.'));
    });
    return json;
  } catch (error) {
    console.error("Erro IA:", error);
    return { intent: "CHAT", reply_text: "Não entendi. Tente simplificar." };
  }
}

// --- 6. MIDDLEWARE AUTH ---
async function getUserAuth(ctx) {
  const telegramChatId = ctx.chat.id.toString();
  const { data } = await supabase.from('user_integrations').select('user_id').eq('telegram_chat_id', telegramChatId).single();
  return data ? data.user_id : null;
}

// --- 7. COMANDOS ---
bot.start(async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply(`🔒 Use /start SEU-TOKEN para conectar.`);
  const token = args[1].trim();
  const { data: integration } = await supabase.from('user_integrations').select('*').eq('connection_token', token).single();
  if (!integration) return ctx.reply('❌ Token inválido.');
  await supabase.from('user_integrations').update({ telegram_chat_id: ctx.chat.id.toString(), telegram_username: ctx.from.username, connection_token: null }).eq('id', integration.id);
  ctx.reply(`✅ **Conectado!** Bot atualizado e estável.`);
});

bot.command('ajuda', async (ctx) => ctx.reply(ajudaMenu.text, ajudaMenu.buttons));
// Callbacks simplificados para economizar linhas
bot.action('help_metas', (ctx) => ctx.editMessageText(`🎯 **Metas**: "Nova meta Carro 30k" ou "Guardar 100 no Carro"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
bot.action('help_gastos', (ctx) => ctx.editMessageText(`💸 **Gastos**: "Gastei 50 no Uber"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
bot.action('help_ganhos', (ctx) => ctx.editMessageText(`💰 **Ganhos**: "Recebi 500"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
bot.action('help_consultas', (ctx) => ctx.editMessageText(`📊 **Consultas**: "Saldo", "Resumo"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
bot.action('help_erros', (ctx) => ctx.editMessageText(`❌ **Corrigir**: "Desfazer"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
bot.action('help_main', (ctx) => ctx.editMessageText(ajudaMenu.text, ajudaMenu.buttons));
bot.action('help_close', (ctx) => ctx.deleteMessage());

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const userId = await getUserAuth(ctx);
  if (!userId) return ctx.reply('🔒 Conecte-se primeiro.');

  await ctx.sendChatAction('typing');

  let decisao = await rotearIntencao(ctx.message.text);
  if (decisao.intent === 'USE_AI') decisao = await processarComIA(ctx.message.text);

  switch (decisao.intent) {
    case 'CREATE_GOAL': await handleCreateGoal(ctx, userId, decisao.data); break;
    case 'ADD_TO_GOAL': await handleAddToGoal(ctx, userId, decisao.data); break;
    case 'ADD_TRANSACTION': await handleAddTransaction(ctx, userId, decisao.data); break;
    case 'DELETE_LAST': await handleDeleteLast(ctx, userId); break;
    case 'CHECK_BALANCE': await handleCheckBalance(ctx, userId); break;
    case 'CHECK_BILLS': await handleCheckBills(ctx, userId); break;
    case 'CHAT_LOCAL': ctx.reply(decisao.reply); break;
    case 'CHAT': default: ctx.reply(decisao.reply_text || "🤔 Não entendi."); break;
  }
});

// --- HANDLERS ---
async function handleCreateGoal(ctx, userId, data) {
  if (!data.title) return ctx.reply("❓ Nome da meta?");
  const { error } = await supabase.from('goals').insert({ user_id: userId, title: data.title, target_amount: data.target_amount || 0, current_amount: 0 });
  if (error) return ctx.reply("❌ Erro ao criar.");
  ctx.reply(`🎯 **Meta Criada!**\nObjetivo: ${data.title}\nAlvo: R$ ${data.target_amount}`);
}

async function handleAddToGoal(ctx, userId, data) {
  if (!data.amount) return ctx.reply("❓ Quanto guardar?");
  const { data: goals } = await supabase.from('goals').select('*').eq('user_id', userId).ilike('title', `%${data.goal_name_guess}%`).limit(1);
  if (!goals?.length) return ctx.reply("⚠️ Meta não encontrada.");
  const meta = goals[0];
  const novoValor = Number(meta.current_amount) + Number(data.amount);
  await supabase.from('goals').update({ current_amount: novoValor }).eq('id', meta.id);
  const pct = meta.target_amount > 0 ? (novoValor / meta.target_amount * 100).toFixed(1) : 0;
  ctx.reply(`💰 **Depósito!**\n${meta.title}: +R$ ${data.amount}\nTotal: R$ ${novoValor} (${pct}%)`);
}

async function handleAddTransaction(ctx, userId, data) {
  if (!data?.amount) return ctx.reply("❓ Valor?");
  let catId = null, catName = 'Geral';
  const { data: cat } = await supabase.from('categories').select('id, name').ilike('name', `%${data.category_guess}%`).limit(1).maybeSingle();
  if (cat) { catId = cat.id; catName = cat.name; } 
  else { const { data: fb } = await supabase.from('categories').select('id, name').limit(1).single(); catId = fb?.id; }

  const { error } = await supabase.from('transactions').insert({ user_id: userId, description: data.description || "Bot", amount: data.amount, type: data.type, category_id: catId, date: new Date().toISOString() });
  if (error) return ctx.reply("❌ Erro.");

  let extra = "";
  if (data.type === 'expense') {
    const { data: budget } = await supabase.from('budgets').select('limit_amount').eq('user_id', userId).eq('category_id', catId).maybeSingle();
    if (budget) {
       const inicio = new Date(new Date().setDate(1)).toISOString();
       const { data: trs } = await supabase.from('transactions').select('amount').eq('user_id', userId).eq('category_id', catId).eq('type', 'expense').gte('date', inicio);
       const tot = trs.reduce((a,b)=>a+Number(b.amount),0);
       if (tot > budget.limit_amount) extra = `\n🚨 **Estourou!** (${((tot/budget.limit_amount)*100).toFixed(0)}%)`;
    }
  } else if (data.type === 'income') {
    const { data: g } = await supabase.from('goals').select('*').eq('user_id', userId).lt('current_amount', supabase.raw('target_amount')).limit(1);
    if (g?.length) extra = `\n🎯 **Coach:** Guarde ${(data.amount*0.1).toFixed(0)} na meta "${g[0].title}"!`;
  }
  ctx.reply(`${data.smart_comment || "Ok!"}\n✅ **${data.description}**\n💲 R$ ${data.amount}\n📂 ${catName}${extra}`);
}

async function handleDeleteLast(ctx, userId) {
  const { data: last } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).single();
  if (!last) return ctx.reply("🚫 Nada.");
  await supabase.from('transactions').delete().eq('id', last.id);
  ctx.reply(`🗑️ Apagado: ${last.description} (R$ ${last.amount})`);
}

async function handleCheckBalance(ctx, userId) {
    const hoje = new Date();
    const inicio = new Date(hoje.setDate(1)).toISOString();
    const { data: trs } = await supabase.from('transactions').select('*').eq('user_id', userId).gte('date', inicio);
    let rec = 0, desp = 0; trs.forEach(t => t.type === 'income' ? rec += t.amount : desp += t.amount);
    ctx.reply(`📊 **Resumo:**\n🟢 Entradas: R$ ${rec}\n🔴 Saídas: R$ ${desp}\n💵 **Saldo: R$ ${rec-desp}**`);
}

async function handleCheckBills(ctx, userId) {
    const { data: bills } = await supabase.from('recurring_bills').select('*').eq('user_id', userId).gte('due_day', new Date().getDate()).limit(5);
    if (!bills?.length) return ctx.reply("✅ Sem contas.");
    ctx.reply(`📅 **Contas:**\n` + bills.map(b => `• ${b.description}: R$ ${b.amount} (Dia ${b.due_day})`).join('\n'));
}

// CRON
cron.schedule('0 8 * * *', async () => {
  const { data: ints } = await supabase.from('user_integrations').select('*').not('telegram_chat_id', 'is', null);
  if (!ints) return;
  for (const user of ints) {
    // Lógica simplificada para o cron não travar
    const { data: bills } = await supabase.from('recurring_bills').select('*').eq('user_id', user.user_id).eq('due_day', new Date().getDate());
    if (bills?.length) bot.telegram.sendMessage(user.telegram_chat_id, `🔔 **Bom dia!**\nVocê tem ${bills.length} contas vencendo hoje.`);
  }
}, { timezone: "America/Sao_Paulo" });

// --- 🔥 TRUQUE DO RENDER (HEALTH CHECK SERVER) 🔥 ---
// O Render exige uma porta aberta. Se não tiver, ele acha que o deploy falhou.
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running OK');
}).listen(PORT, () => {
  console.log(`🌍 Health Check Server rodando na porta ${PORT}`);
});

// Lançamento do Bot
bot.launch({ dropPendingUpdates: true, polling: { retryAfter: 2000, timeout: 30 } })
  .then(() => console.log('✅ Bot Iniciado!'))
  .catch((err) => { 
    console.error('❌ Erro Boot:', err); 
    if(err.description?.includes('Conflict')) process.exit(1); 
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));