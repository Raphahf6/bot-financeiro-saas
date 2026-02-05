require('dotenv').config();
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cron = require('node-cron');

// --- VALIDAÇÃO ---
const REQUIRED_VARS = ['TELEGRAM_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'GEMINI_API_KEY'];
REQUIRED_VARS.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ ERRO: Faltando ${key} no .env`);
    process.exit(1);
  }
});

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// NOTA: Na API oficial pública, o modelo estável atual é 'gemini-1.5-flash'. 
// Se você tiver acesso beta ao 2.5, altere aqui. Caso dê erro 404, volte para 1.5-flash.
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

console.log('🧠 Bot Financeiro (Com função DELETAR) Iniciado...');

// --- FILTRO INTELIGENTE (ROTEADOR) ---
async function rotearIntencao(texto) {
  const t = texto.toLowerCase();

  // 1. Consultas de Saldo
  if (t.match(/(saldo|resumo|quanto.*gastei|gastos.*mes|fatura|balan[çc]o)/)) return { intent: 'CHECK_BALANCE' };

  // 2. Consultas de Contas
  if (t.match(/(conta|boleto|pagar|vencendo|vence|hoje|amanh[ãa])/)) return { intent: 'CHECK_BILLS' };

  // 3. Exclusão Rápida (NOVO)
  if (t.match(/(apaga|exclui|deleta|desfaz|remover|tira).*ultim[oa]/)) return { intent: 'DELETE_LAST' };

  // 4. Saudações
  if (t.match(/^(oi|ol[áa]|bom dia|boa tarde|boa noite|eai|opa)$/)) {
    return { intent: 'CHAT_LOCAL', reply: "Olá! Posso registrar gastos ('Gastei 50'), ver saldo ou apagar o último lançamento ('Desfazer')." };
  }

  return { intent: 'USE_AI' };
}

// --- FUNÇÃO CÉREBRO (IA) ---
async function processarComIA(mensagemTexto) {
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  
  const prompt = `
    Hoje: ${dataHoje}.
    Analise: "${mensagemTexto}".
    
    Identifique a intenção.
    Intents Possíveis: 
    - ADD_TRANSACTION (Gastar, Receber)
    - DELETE_LAST (Apagar, desfazer, excluir o anterior/último)
    - CHAT (Conversa fiada)

    Responda JSON puro:
    {
      "intent": "ADD_TRANSACTION" | "DELETE_LAST" | "CHAT",
      "data": {
        "type": "expense" | "income",
        "amount": 0.00,
        "description": "string",
        "category_guess": "string"
      },
      "reply_text": "string"
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text().replace(/```json|```/g, '').trim();
    const json = JSON.parse(text);

    // Sanitização de valor numérico
    if (json.data && json.data.amount) {
        if (typeof json.data.amount === 'string') {
            json.data.amount = parseFloat(json.data.amount.replace('R$', '').replace(',', '.').trim());
        }
    }
    return json;
  } catch (error) {
    console.error("Erro IA:", error);
    return { intent: "CHAT", reply_text: "Não entendi. Tente 'Gastei 50' ou 'Desfazer'." };
  }
}

// --- MIDDLEWARE AUTH ---
async function getUserAuth(ctx) {
  const telegramChatId = ctx.chat.id.toString();
  const { data } = await supabase.from('user_integrations').select('user_id').eq('telegram_chat_id', telegramChatId).single();
  return data ? data.user_id : null;
}

// --- /start ---
bot.start(async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply(`Olá! Gere seu token no site e envie: /start SEU-TOKEN`);
  
  const token = args[1].trim();
  const { data: integration } = await supabase.from('user_integrations').select('*').eq('connection_token', token).single();

  if (!integration) return ctx.reply('❌ Token inválido.');

  await supabase.from('user_integrations').update({
    telegram_chat_id: ctx.chat.id.toString(),
    telegram_username: ctx.from.username,
    connection_token: null
  }).eq('id', integration.id);

  ctx.reply(`✅ Conectado! Tente mandar: "Gastei 50 no café".`);
});

// --- PROCESSADOR ---
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  
  const userId = await getUserAuth(ctx);
  if (!userId) return ctx.reply('🔒 Use /start SEU-TOKEN para conectar.');

  await ctx.sendChatAction('typing');

  let decisao = await rotearIntencao(ctx.message.text);

  if (decisao.intent === 'USE_AI') {
    decisao = await processarComIA(ctx.message.text);
  }

  switch (decisao.intent) {
    case 'ADD_TRANSACTION':
      if(!decisao.data) ctx.reply("Faltou dados do gasto.");
      else await handleAddTransaction(ctx, userId, decisao.data);
      break;
      
    case 'DELETE_LAST': // <--- NOVA FUNÇÃO
      await handleDeleteLast(ctx, userId);
      break;

    case 'CHECK_BALANCE':
      await handleCheckBalance(ctx, userId);
      break;

    case 'CHECK_BILLS':
      await handleCheckBills(ctx, userId);
      break;

    case 'CHAT_LOCAL':
      ctx.reply(decisao.reply);
      break;

    case 'CHAT':
    default:
      ctx.reply(decisao.reply_text || "Comando não reconhecido.");
      break;
  }
});

// --- HANDLERS ---

// 1. Adicionar
async function handleAddTransaction(ctx, userId, data) {
  let finalAmount = data.amount;
  if (!finalAmount) return ctx.reply("Valor não identificado.");

  let categoryId = null;
  const { data: cat } = await supabase.from('categories').select('id').ilike('name', `%${data.category_guess}%`).limit(1).maybeSingle();
  if (cat) categoryId = cat.id;
  else {
    const { data: anyCat } = await supabase.from('categories').select('id').limit(1).single();
    categoryId = anyCat?.id;
  }

  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    description: data.description || "Gasto via Telegram",
    amount: finalAmount,
    type: data.type,
    category_id: categoryId,
    date: new Date().toISOString()
  });

  if (error) return ctx.reply("Erro ao salvar.");
  const emoji = data.type === 'expense' ? '💸' : '💰';
  ctx.reply(`${emoji} **Salvo!**\n📝 ${data.description}\n💲 R$ ${finalAmount}`);
}

// 2. Deletar Último (NOVO)
async function handleDeleteLast(ctx, userId) {
  // Busca a última transação criada
  const { data: lastTrans, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!lastTrans) return ctx.reply("🚫 Nenhuma transação recente para apagar.");

  // Deleta ela
  const { error: delError } = await supabase
    .from('transactions')
    .delete()
    .eq('id', lastTrans.id);

  if (delError) return ctx.reply("Erro ao tentar apagar.");

  ctx.reply(`🗑️ **Apagado com sucesso!**\n\nRemovi: ${lastTrans.description} (R$ ${lastTrans.amount})`);
}

// 3. Saldo
async function handleCheckBalance(ctx, userId) {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();

  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, type')
    .eq('user_id', userId)
    .gte('date', primeiroDia);

  let receitas = 0, despesas = 0;
  transactions.forEach(t => {
    if (t.type === 'income') receitas += Number(t.amount);
    if (t.type === 'expense') despesas += Number(t.amount);
  });

  const { data: profile } = await supabase.from('profiles').select('monthly_income').eq('id', userId).single();
  const renda = profile?.monthly_income || 0;

  ctx.reply(
    `📊 **Resumo Mensal:**\n\n💰 Renda: R$ ${renda}\n🟢 Receitas: R$ ${receitas}\n🔴 Gastos: R$ ${despesas}\n──────────\n💵 **Saldo: R$ ${(receitas - despesas).toFixed(2)}**`
  );
}

// 4. Contas
async function handleCheckBills(ctx, userId) {
  const diaHoje = new Date().getDate();
  const { data: bills } = await supabase
    .from('recurring_bills')
    .select('*')
    .eq('user_id', userId)
    .gte('due_day', diaHoje)
    .order('due_day', { ascending: true })
    .limit(5);

  if (!bills || bills.length === 0) return ctx.reply("✅ Sem contas próximas.");

  let msg = `📅 **Próximas Contas:**\n\n`;
  bills.forEach(b => msg += `• ${b.description}: R$ ${b.amount} (Dia ${b.due_day})\n`);
  ctx.reply(msg);
}

// Cron Job (9h)
cron.schedule('0 9 * * *', async () => {
  const { data: integrations } = await supabase.from('user_integrations').select('*').not('telegram_chat_id', 'is', null);
  if (!integrations) return;
  const dia = new Date().getDate();
  for (const user of integrations) {
    const { data: bills } = await supabase.from('recurring_bills').select('*').eq('user_id', user.user_id).eq('due_day', dia);
    if (bills && bills.length > 0) {
      let msg = `🔔 **Vence Hoje:**\n`;
      bills.forEach(b => msg += `❗ ${b.description} - R$ ${b.amount}\n`);
      bot.telegram.sendMessage(user.telegram_chat_id, msg);
    }
  }
}, { timezone: "America/Sao_Paulo" });

bot.launch({
  dropPendingUpdates: true, // Limpa mensagens acumuladas na fila pra não travar no boot
  polling: {
    // Se der erro 409, espera 2 segundos antes de tentar de novo
    // Isso dá tempo pro Render matar o processo velho
    retryAfter: 2000, 
    timeout: 30
  }
}).then(() => {
  console.log('✅ Bot iniciado com sucesso!');
}).catch((err) => {
  console.error('❌ Erro fatal no boot:', err);
  // Se der erro de conflito, encerra o processo para o Render tentar reiniciar do zero
  if (err.description && err.description.includes('Conflict')) {
    console.log('🔄 Conflito detectado. Encerrando para reinício limpo...');
    process.exit(1);
  }
});

// Tratamento de Encerramento (Graceful Shutdown)
// Isso garante que o bot solte o Token assim que o Render mandar matar
const stopBot = (signal) => {
  console.log(`🛑 Recebido sinal ${signal}. Parando bot...`);
  bot.stop(signal);
  process.exit(0);
};

process.once('SIGINT', () => stopBot('SIGINT'));
process.once('SIGTERM', () => stopBot('SIGTERM'));