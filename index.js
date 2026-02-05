require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cron = require('node-cron');

// --- 1. VALIDAÇÃO DE AMBIENTE ---
const REQUIRED_VARS = ['TELEGRAM_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'GEMINI_API_KEY'];
REQUIRED_VARS.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ ERRO FATAL: Faltando ${key} no .env`);
    process.exit(1);
  }
});

// --- 2. INICIALIZAÇÃO DOS SERVIÇOS ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🚀 MODELO ULTIMATO: Usando a versão 2.5 Flash conforme solicitado
// Caso dê erro 404 (se sua conta não tiver acesso ainda), o bot avisa no console.
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

console.log('💎 Bot Versão Ultimato (Gemini 2.5) Iniciado...');

// --- 3. MENU DE AJUDA INTERATIVO (O "Anexo" que você pediu) ---
const ajudaMenu = {
  text: `🎓 **Central de Ajuda Financeira**\n\nEu sou seu assistente pessoal. Não sou um robô burro, eu entendo o que você fala!\n\nSelecione um tópico abaixo para aprender:`,
  buttons: Markup.inlineKeyboard([
    [Markup.button.callback('💸 Como Lançar Gastos', 'help_gastos')],
    [Markup.button.callback('💰 Como Lançar Ganhos', 'help_ganhos')],
    [Markup.button.callback('📊 Consultas e Saldo', 'help_consultas')],
    [Markup.button.callback('❌ Corrigir Erros', 'help_erros')],
    [Markup.button.callback('🔙 Fechar Ajuda', 'help_close')]
  ])
};

// --- 4. CÉREBRO DA IA (Roteador e Processador) ---
async function rotearIntencao(texto) {
  const t = texto.toLowerCase();
  if (t.match(/(saldo|resumo|quanto.*gastei|gastos.*mes|fatura|balan[çc]o)/)) return { intent: 'CHECK_BALANCE' };
  if (t.match(/(conta|boleto|pagar|vencendo|vence|hoje|amanh[ãa])/)) return { intent: 'CHECK_BILLS' };
  if (t.match(/(apaga|exclui|deleta|desfaz|remover|tira).*ultim[oa]/)) return { intent: 'DELETE_LAST' };
  if (t.match(/^(oi|ol[áa]|bom dia|boa tarde|boa noite|eai|opa)$/)) return { intent: 'CHAT_LOCAL', reply: "Olá! 👋 Sou seu Assistente Financeiro 2.0. Use /ajuda para ver o que sei fazer." };
  return { intent: 'USE_AI' };
}

async function processarComIA(mensagemTexto) {
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const prompt = `
    Data: ${dataHoje}. Analise: "${mensagemTexto}".
    Intents: ADD_TRANSACTION, DELETE_LAST, CHAT.
    JSON Output ONLY:
    {
      "intent": "ADD_TRANSACTION" | "DELETE_LAST" | "CHAT",
      "data": { "type": "expense"|"income", "amount": 0.00, "description": "string", "category_guess": "string" },
      "reply_text": "string"
    }
  `;
  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text().replace(/```json|```/g, '').trim();
    const json = JSON.parse(text);
    if (json.data?.amount && typeof json.data.amount === 'string') {
        json.data.amount = parseFloat(json.data.amount.replace('R$', '').replace(',', '.').trim());
    }
    return json;
  } catch (error) {
    console.error("Erro IA:", error);
    return { intent: "CHAT", reply_text: "Desculpe, meu cérebro IA falhou momentaneamente. Tente novamente." };
  }
}

// --- 5. MIDDLEWARES E UTILITÁRIOS ---
async function getUserAuth(ctx) {
  const telegramChatId = ctx.chat.id.toString();
  const { data } = await supabase.from('user_integrations').select('user_id').eq('telegram_chat_id', telegramChatId).single();
  return data ? data.user_id : null;
}

// --- 6. COMANDOS PRINCIPAIS ---

// /start - Conexão Segura
bot.start(async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply(`🔒 **Segurança:** Gere seu token no site e envie:\n\n/start SEU-TOKEN`);
  
  const token = args[1].trim();
  const { data: integration } = await supabase.from('user_integrations').select('*').eq('connection_token', token).single();

  if (!integration) return ctx.reply('❌ Token inválido ou expirado.');

  await supabase.from('user_integrations').update({
    telegram_chat_id: ctx.chat.id.toString(),
    telegram_username: ctx.from.username,
    connection_token: null
  }).eq('id', integration.id);

  ctx.reply(`✅ **Conectado com Sucesso!**\n\nAgora sou seu assistente oficial. Clique em /ajuda para aprender a me usar.`);
});

// /ajuda - O Menu Interativo
bot.command('ajuda', async (ctx) => {
  await ctx.reply(ajudaMenu.text, ajudaMenu.buttons);
});

// Ações dos Botões de Ajuda (Navegação sem digitar)
bot.action('help_gastos', (ctx) => {
  ctx.editMessageText(
    `💸 **Como Lançar Gastos**\n\nBasta falar naturalmente! Exemplos:\n\n• "Gastei 50 no Uber"\n• "Paguei 100 de internet"\n• "Almoço 35,90"\n• "Comprei um mouse de 150 reais"`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])
  );
});

bot.action('help_ganhos', (ctx) => {
  ctx.editMessageText(
    `💰 **Como Lançar Ganhos**\n\nRecebeu dinheiro? Me avise:\n\n• "Recebi 1500 do freela"\n• "Caiu 500 reais na conta"\n• "Depósito de 200"`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])
  );
});

bot.action('help_consultas', (ctx) => {
  ctx.editMessageText(
    `📊 **Consultas Inteligentes**\n\nPergunte o que quiser:\n\n• "Quanto gastei esse mês?"\n• "Qual meu saldo?"\n• "Tenho contas pra pagar hoje?"\n• "Resumo do mês"`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])
  );
});

bot.action('help_erros', (ctx) => {
  ctx.editMessageText(
    `❌ **Errou? Sem problemas!**\n\nSe você lançou algo errado ou duplicado, apenas diga:\n\n• "Desfazer"\n• "Apagar último"\n• "Excluir lançamento anterior"`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])
  );
});

bot.action('help_main', (ctx) => {
  ctx.editMessageText(ajudaMenu.text, ajudaMenu.buttons);
});

bot.action('help_close', (ctx) => {
  ctx.deleteMessage(); // Limpa o chat
});

// --- 7. PROCESSADOR DE MENSAGENS (O Fluxo Principal) ---
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return; // Ignora comandos
  
  const userId = await getUserAuth(ctx);
  if (!userId) return ctx.reply('🔒 Use /start SEU-TOKEN para conectar.');

  await ctx.sendChatAction('typing');

  // Roteamento Híbrido (Local + IA)
  let decisao = await rotearIntencao(ctx.message.text);
  if (decisao.intent === 'USE_AI') {
    decisao = await processarComIA(ctx.message.text);
  }

  // Execução
  switch (decisao.intent) {
    case 'ADD_TRANSACTION':
      await handleAddTransaction(ctx, userId, decisao.data);
      break;
    case 'DELETE_LAST':
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
      ctx.reply(decisao.reply_text || "🤔 Não entendi. Tente usar o menu /ajuda.");
      break;
  }
});

// --- 8. FUNÇÕES DE BANCO DE DADOS (Handlers) ---

async function handleAddTransaction(ctx, userId, data) {
  if (!data?.amount) return ctx.reply("❓ Não entendi o valor. Tente 'Gastei 50'.");

  let categoryId = null;
  const { data: cat } = await supabase.from('categories').select('id').ilike('name', `%${data.category_guess}%`).limit(1).maybeSingle();
  if (cat) categoryId = cat.id;
  else {
    const { data: fallback } = await supabase.from('categories').select('id').limit(1).single();
    categoryId = fallback?.id;
  }

  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    description: data.description || "Transação Telegram",
    amount: data.amount,
    type: data.type,
    category_id: categoryId,
    date: new Date().toISOString()
  });

  if (error) return ctx.reply("❌ Erro ao salvar no banco.");
  
  const emoji = data.type === 'expense' ? '💸' : '💰';
  ctx.reply(`${emoji} **Registrado!**\n📝 ${data.description}\n💲 R$ ${data.amount.toFixed(2)}`);
}

async function handleDeleteLast(ctx, userId) {
  const { data: last, error } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).single();
  if (!last) return ctx.reply("🚫 Nada para apagar.");
  
  await supabase.from('transactions').delete().eq('id', last.id);
  ctx.reply(`🗑️ **Apagado:** ${last.description} (R$ ${last.amount})`);
}

async function handleCheckBalance(ctx, userId) {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
  const { data: transactions } = await supabase.from('transactions').select('amount, type').eq('user_id', userId).gte('date', primeiroDia);

  let rec = 0, desp = 0;
  transactions.forEach(t => t.type === 'income' ? rec += t.amount : desp += t.amount);
  
  const { data: profile } = await supabase.from('profiles').select('monthly_income').eq('id', userId).single();
  
  ctx.reply(`📊 **Resumo Mensal:**\n\n🎯 Meta: R$ ${profile?.monthly_income || 0}\n🟢 Receitas: R$ ${rec.toFixed(2)}\n🔴 Despesas: R$ ${desp.toFixed(2)}\n──────────\n💵 **Saldo: R$ ${(rec - desp).toFixed(2)}**`);
}

async function handleCheckBills(ctx, userId) {
  const dia = new Date().getDate();
  const { data: bills } = await supabase.from('recurring_bills').select('*').eq('user_id', userId).gte('due_day', dia).order('due_day').limit(5);
  if (!bills?.length) return ctx.reply("✅ Sem contas próximas.");
  
  let msg = `📅 **Próximas Contas:**\n\n`;
  bills.forEach(b => msg += `• ${b.description}: R$ ${b.amount} (Dia ${b.due_day})\n`);
  ctx.reply(msg);
}

// --- 9. CRON JOB (Notificação Matinal) ---
cron.schedule('0 9 * * *', async () => {
  const { data: integrations } = await supabase.from('user_integrations').select('*').not('telegram_chat_id', 'is', null);
  if (!integrations) return;
  
  const dia = new Date().getDate();
  for (const user of integrations) {
    const { data: bills } = await supabase.from('recurring_bills').select('*').eq('user_id', user.user_id).eq('due_day', dia);
    if (bills?.length) {
      let msg = `🔔 **Vencimentos de Hoje:**\n`;
      bills.forEach(b => msg += `❗ ${b.description} - R$ ${b.amount}\n`);
      bot.telegram.sendMessage(user.telegram_chat_id, msg);
    }
  }
}, { timezone: "America/Sao_Paulo" });

// --- 10. LANÇAMENTO ROBUSTO COM MENU NATIVO ---
bot.launch({
  dropPendingUpdates: true,
  polling: { retryAfter: 2000, timeout: 30 }
}).then(async () => {
  // 🔥 AQUI ESTÁ A MÁGICA: Registra o Menu no Telegram
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Reconectar ou Iniciar' },
      { command: 'ajuda', description: '🎓 Aprender a usar o bot' },
      { command: 'hoje', description: '📅 Ver contas de hoje' },
      { command: 'saldo', description: '📊 Ver resumo do mês' }
    ]);
    console.log('✅ Menu de comandos nativo atualizado!');
  } catch (e) {
    console.error('⚠️ Aviso: Não foi possível atualizar o menu nativo (talvez delay do Telegram).');
  }
  console.log('🚀 Bot Ultimato Online!');
}).catch((err) => {
  console.error('❌ Erro no boot:', err);
  if (err.description && err.description.includes('Conflict')) process.exit(1);
});

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));