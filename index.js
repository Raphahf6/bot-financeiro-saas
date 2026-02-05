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

// Usamos a versão 002 ou a mais recente estável
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

console.log('🧠 Bot Híbrido (Correção JSON) Iniciado...');

// --- FILTRO INTELIGENTE (ROTEADOR) ---
async function rotearIntencao(texto) {
  const t = texto.toLowerCase();

  // 1. Consultas de Saldo/Resumo
  if (t.match(/(saldo|resumo|quanto.*gastei|gastos.*mes|fatura|balan[çc]o)/)) {
    return { intent: 'CHECK_BALANCE' };
  }

  // 2. Consultas de Contas/Vencimentos
  if (t.match(/(conta|boleto|pagar|vencendo|vence|hoje|amanh[ãa])/)) {
    return { intent: 'CHECK_BILLS' };
  }

  // 3. Saudações Simples
  if (t.match(/^(oi|ol[áa]|bom dia|boa tarde|boa noite|eai|opa)$/)) {
    return { intent: 'CHAT_LOCAL', reply: "Olá! Sou seu assistente financeiro. Pode me contar seus gastos ou perguntar sobre seu saldo." };
  }

  // 4. Ajuda
  if (t.match(/^(ajuda|help|comandos|o que.*fazer)/)) {
    return { intent: 'CHAT_LOCAL', reply: "Tente dizer:\n\n• 'Gastei 50 no Uber'\n• 'Recebi 1000'\n• 'Qual meu saldo?'\n• 'Contas de hoje'" };
  }

  return { intent: 'USE_AI' };
}

// --- FUNÇÃO CÉREBRO (IA) ---
async function processarComIA(mensagemTexto) {
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  
  // PROMPT CORRIGIDO: Estrutura JSON Rígida
  const prompt = `
    Hoje: ${dataHoje}.
    Analise a mensagem: "${mensagemTexto}".
    
    Se for sobre gastar ou receber dinheiro, extraia os dados.
    Se for conversa fiada, responda.

    Responda ESTRITAMENTE com este formato JSON (sem markdown):
    {
      "intent": "ADD_TRANSACTION" ou "CHAT",
      "data": {
        "type": "expense" (gasto) ou "income" (ganho),
        "amount": 0.00,
        "description": "string",
        "category_guess": "string (ex: Alimentação, Transporte, Lazer, Moradia, Outros)"
      },
      "reply_text": "string (apenas se for CHAT)"
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text();
    // Limpeza agressiva para garantir JSON puro
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const json = JSON.parse(text);
    
    // Tratamento de segurança: Se a IA devolver o valor como string "15,50", converte para numero
    if (json.data && json.data.amount) {
        if (typeof json.data.amount === 'string') {
            json.data.amount = parseFloat(json.data.amount.replace('R$', '').replace(',', '.').trim());
        }
    }
    
    return json;
  } catch (error) {
    console.error("Erro IA:", error);
    return { intent: "CHAT", reply_text: "Não consegui entender os valores. Tente simplificar, ex: 'Gastei 15'." };
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

  // Debug no console para você ver o que está chegando
  console.log("Decisão Final:", JSON.stringify(decisao, null, 2));

  switch (decisao.intent) {
    case 'ADD_TRANSACTION':
      // Verificação extra: data existe?
      if (!decisao.data) {
          ctx.reply("Entendi que é uma transação, mas faltou dados. Tente 'Gastei 50 em X'.");
      } else {
          await handleAddTransaction(ctx, userId, decisao.data);
      }
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
async function handleAddTransaction(ctx, userId, data) {
  // Sanitização final do valor (Blindagem)
  let finalAmount = data.amount;
  if (!finalAmount) {
      return ctx.reply("Não entendi o valor. Tente 'Gastei 50'.");
  }

  // Busca Categoria
  let categoryId = null;
  const { data: cat } = await supabase.from('categories').select('id').ilike('name', `%${data.category_guess}%`).limit(1).maybeSingle();
  
  if (cat) {
    categoryId = cat.id;
  } else {
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

  if (error) {
      console.error(error);
      return ctx.reply("Erro ao salvar no banco de dados.");
  }
  
  const emoji = data.type === 'expense' ? '💸' : '💰';
  ctx.reply(`${emoji} **Salvo!**\n📝 ${data.description}\n💲 R$ ${finalAmount}\n📂 ${data.category_guess || 'Geral'}`);
}

async function handleCheckBalance(ctx, userId) {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();

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
  
  const { data: profile } = await supabase.from('profiles').select('monthly_income').eq('id', userId).single();
  const renda = profile?.monthly_income || 0;

  ctx.reply(
    `📊 **Resumo de ${hoje.toLocaleString('default', { month: 'long' })}:**\n\n` +
    `💰 Renda Planejada: R$ ${renda}\n` +
    `🟢 Entradas Reais: R$ ${receitas.toFixed(2)}\n` +
    `🔴 Gastos Reais: R$ ${despesas.toFixed(2)}\n` +
    `────────────────\n` +
    `💵 **Saldo: R$ ${saldo.toFixed(2)}**`
  );
}

async function handleCheckBills(ctx, userId) {
  const diaHoje = new Date().getDate();
  const { data: bills } = await supabase
    .from('recurring_bills')
    .select('*')
    .eq('user_id', userId)
    .gte('due_day', diaHoje)
    .order('due_day', { ascending: true })
    .limit(5);

  if (!bills || bills.length === 0) {
    return ctx.reply("✅ Nenhuma conta pendente.");
  }

  let msg = `📅 **Próximas Contas:**\n\n`;
  bills.forEach(b => {
    const status = b.due_day === diaHoje ? "❗ HOJE" : `Dia ${b.due_day}`;
    msg += `• ${b.description}: R$ ${b.amount} (${status})\n`;
  });
  
  ctx.reply(msg);
}

// CRON JOB
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
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));