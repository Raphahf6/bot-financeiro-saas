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
// Usamos o Flash: Modelo mais rápido e barato (frequentemente gratuito no tier básico)
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

console.log('🧠 Bot Híbrido (Econômico) Iniciado...');

// --- FILTRO INTELIGENTE (ROTEADOR) ---
// Define se resolvemos localmente (grátis) ou via IA (custo de token)
async function rotearIntencao(texto) {
  const t = texto.toLowerCase();

  // 1. Consultas de Saldo/Resumo (REGEX LOCAL)
  if (t.match(/(saldo|resumo|quanto.*gastei|gastos.*mes|fatura|balan[çc]o)/)) {
    return { intent: 'CHECK_BALANCE' };
  }

  // 2. Consultas de Contas/Vencimentos (REGEX LOCAL)
  if (t.match(/(conta|boleto|pagar|vencendo|vence|hoje|amanh[ãa])/)) {
    return { intent: 'CHECK_BILLS' };
  }

  // 3. Saudações Simples (REGEX LOCAL)
  if (t.match(/^(oi|ol[áa]|bom dia|boa tarde|boa noite|eai|opa)$/)) {
    return { intent: 'CHAT_LOCAL', reply: "Olá! Sou seu assistente financeiro. Pode me contar seus gastos ou perguntar sobre seu saldo." };
  }

  // 4. Ajuda (REGEX LOCAL)
  if (t.match(/^(ajuda|help|comandos|o que.*fazer)/)) {
    return { intent: 'CHAT_LOCAL', reply: "Tente dizer:\n\n• 'Gastei 50 no Uber'\n• 'Recebi 1000'\n• 'Qual meu saldo?'\n• 'Contas de hoje'" };
  }

  // 5. Se não bateu com nada acima, PROVAVELMENTE é um lançamento complexo.
  // Ex: "Comprei 2x burguer king 40 reais" -> Manda para a IA entender.
  return { intent: 'USE_AI' };
}

// --- FUNÇÃO CÉREBRO (IA - Só chamada quando necessário) ---
async function processarComIA(mensagemTexto) {
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  
  // Prompt OTIMIZADO (Curto para economizar tokens de entrada)
  const prompt = `
    Hoje: ${dataHoje}. Analise: "${mensagemTexto}".
    Retorne JSON puro.
    Intents: ADD_TRANSACTION, CHAT.
    Se ADD_TRANSACTION: type (expense/income), amount (number), description, category_guess.
    Se CHAT: reply_text.
  `;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error("Erro IA:", error);
    return { intent: "CHAT", reply_text: "Não entendi. Tente 'Gastei X em Y'." };
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

  ctx.reply(`✅ Conectado! Pode falar naturalmente.`);
});

// --- PROCESSADOR DE MENSAGENS ---
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  
  const userId = await getUserAuth(ctx);
  if (!userId) return ctx.reply('🔒 Use /start SEU-TOKEN para conectar.');

  await ctx.sendChatAction('typing');

  // 1. PASSO ECONÔMICO: Tenta resolver localmente primeiro
  let decisao = await rotearIntencao(ctx.message.text);

  // 2. Se o roteador local decidiu que precisa de IA, aí sim chamamos
  if (decisao.intent === 'USE_AI') {
    // console.log("💸 Usando crédito de IA para entender:", ctx.message.text);
    decisao = await processarComIA(ctx.message.text);
  } else {
    // console.log("⚡ Resolvido localmente (Custo Zero):", decisao.intent);
  }

  // 3. Execução
  switch (decisao.intent) {
    case 'ADD_TRANSACTION':
      await handleAddTransaction(ctx, userId, decisao.data);
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

// --- HANDLERS (Lógica de Banco de Dados) ---

// 1. Adicionar Transação (Vem da IA)
async function handleAddTransaction(ctx, userId, data) {
  if (!data || !data.amount) return ctx.reply("Não entendi o valor. Tente 'Gastei 50'.");

  // Tenta achar categoria
  let categoryId = null;
  const { data: cat } = await supabase.from('categories').select('id').ilike('name', `%${data.category_guess}%`).limit(1).maybeSingle();
  
  if (cat) {
    categoryId = cat.id;
  } else {
    // Fallback: Pega a categoria 'Outros' ou a primeira que achar
    const { data: anyCat } = await supabase.from('categories').select('id').limit(1).single();
    categoryId = anyCat?.id;
  }

  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    description: data.description,
    amount: data.amount,
    type: data.type,
    category_id: categoryId,
    date: new Date().toISOString()
  });

  if (error) return ctx.reply("Erro ao salvar.");
  
  const emoji = data.type === 'expense' ? '💸' : '💰';
  ctx.reply(`${emoji} Salvo: ${data.description} (R$ ${data.amount})`);
}

// 2. Consultar Saldo/Resumo (Local - Custo Zero)
async function handleCheckBalance(ctx, userId) {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();

  // Busca transações do mês
  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, type')
    .eq('user_id', userId)
    .gte('date', primeiroDia);

  let receitas = 0;
  let despesas = 0;

  transactions.forEach(t => {
    if (t.type === 'income') receitas += Number(t.amount);
    if (t.type === 'expense') despesas += Number(t.amount);
  });

  const saldo = receitas - despesas;
  
  // Busca a Renda Planejada (para comparar)
  const { data: profile } = await supabase.from('profiles').select('monthly_income').eq('id', userId).single();
  const renda = profile?.monthly_income || 0;

  ctx.reply(
    `📊 **Resumo de ${hoje.toLocaleString('default', { month: 'long' })}:**\n\n` +
    `💰 Renda Planejada: R$ ${renda}\n` +
    `🟢 Entradas Reais: R$ ${receitas.toFixed(2)}\n` +
    `🔴 Gastos Reais: R$ ${despesas.toFixed(2)}\n` +
    `────────────────\n` +
    `💵 **Saldo (Entradas - Saídas): R$ ${saldo.toFixed(2)}**`
  );
}

// 3. Consultar Contas (Local - Custo Zero)
async function handleCheckBills(ctx, userId) {
  const diaHoje = new Date().getDate();
  
  // Busca contas onde o dia de vencimento é HOJE ou MAIOR (próximas contas)
  // Limitamos a 5 para não poluir o chat
  const { data: bills } = await supabase
    .from('recurring_bills')
    .select('*')
    .eq('user_id', userId)
    .gte('due_day', diaHoje)
    .order('due_day', { ascending: true })
    .limit(5);

  if (!bills || bills.length === 0) {
    return ctx.reply("✅ Nenhuma conta pendente para os próximos dias deste mês.");
  }

  let msg = `📅 **Próximas Contas:**\n\n`;
  bills.forEach(b => {
    const status = b.due_day === diaHoje ? "❗ HOJE" : `Dia ${b.due_day}`;
    msg += `• ${b.description}: R$ ${b.amount} (${status})\n`;
  });
  
  ctx.reply(msg);
}

// --- CRON (Diário) ---
cron.schedule('0 9 * * *', async () => {
  const { data: integrations } = await supabase.from('user_integrations').select('*').not('telegram_chat_id', 'is', null);
  if (!integrations) return;

  const dia = new Date().getDate();
  for (const user of integrations) {
    const { data: bills } = await supabase.from('recurring_bills').select('*').eq('user_id', user.user_id).eq('due_day', dia);
    if (bills && bills.length > 0) {
      let msg = `🔔 **Vencimentos de Hoje:**\n`;
      bills.forEach(b => msg += `❗ ${b.description} - R$ ${b.amount}\n`);
      bot.telegram.sendMessage(user.telegram_chat_id, msg);
    }
  }
}, { timezone: "America/Sao_Paulo" });

bot.launch();