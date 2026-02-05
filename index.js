require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cron = require('node-cron');

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
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Use a versão mais recente disponível

console.log('🚀 Bot Coach Financeiro Iniciado...');

// --- 3. MENU DE AJUDA ---
const ajudaMenu = {
  text: `🎓 **Central do Coach Financeiro**\n\nEstou aqui para analisar sua saúde financeira e te ajudar a bater metas!\n\nSelecione:`,
  buttons: Markup.inlineKeyboard([
    [Markup.button.callback('💸 Lançar Gasto', 'help_gastos')],
    [Markup.button.callback('💰 Lançar Ganho', 'help_ganhos')],
    [Markup.button.callback('📊 Minha Saúde', 'help_consultas')], // Alterado
    [Markup.button.callback('❌ Corrigir', 'help_erros')],
    [Markup.button.callback('🔙 Fechar', 'help_close')]
  ])
};

// --- 4. ROTEADOR ---
async function rotearIntencao(texto) {
  const t = texto.toLowerCase();
  if (t.match(/(saldo|resumo|quanto.*gastei|gastos.*mes|fatura|balan[çc]o|saude|saúde)/)) return { intent: 'CHECK_BALANCE' };
  if (t.match(/(conta|boleto|pagar|vencendo|vence|hoje|amanh[ãa])/)) return { intent: 'CHECK_BILLS' };
  if (t.match(/(apaga|exclui|deleta|desfaz|remover|tira).*ultim[oa]/)) return { intent: 'DELETE_LAST' };
  if (t.match(/^(oi|ol[áa]|bom dia|boa tarde|boa noite|eai|opa)$/)) return { intent: 'CHAT_LOCAL', reply: "Olá! 👋 Sou seu Coach Financeiro. Bora bater essas metas?" };
  return { intent: 'USE_AI' };
}

// --- 5. CÉREBRO IA ---
async function processarComIA(mensagemTexto) {
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  
  const prompt = `
    Hoje: ${dataHoje}.
    Analise: "${mensagemTexto}".
    
    Identifique a intenção: ADD_TRANSACTION, DELETE_LAST, CHAT.
    
    Se ADD_TRANSACTION:
    - Extraia type (expense/income), amount, description, category_guess.
    - Gere "smart_comment": Comentário carismático (máx 1 frase).
    
    Responda JSON puro:
    {
      "intent": "ADD_TRANSACTION" | "DELETE_LAST" | "CHAT",
      "data": { 
        "type": "expense" | "income", 
        "amount": 0.00, 
        "description": "string", 
        "category_guess": "string",
        "smart_comment": "string" 
      },
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
    return { intent: "CHAT", reply_text: "Não entendi o valor. Tente 'Gastei 50'." };
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
  ctx.reply(`✅ **Conectado!** Agora vou analisar suas finanças diariamente.`);
});

bot.command('ajuda', async (ctx) => ctx.reply(ajudaMenu.text, ajudaMenu.buttons));
bot.action('help_gastos', (ctx) => ctx.editMessageText(`💸 **Lançar Gastos**\nEx: "Gastei 50 no Uber"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
bot.action('help_ganhos', (ctx) => ctx.editMessageText(`💰 **Lançar Ganhos**\nEx: "Recebi 500"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
bot.action('help_consultas', (ctx) => ctx.editMessageText(`📊 **Saúde Financeira**\nEx: "Como está minha saúde?" ou "Saldo"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
bot.action('help_erros', (ctx) => ctx.editMessageText(`❌ **Corrigir**\nEx: "Desfazer"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
bot.action('help_main', (ctx) => ctx.editMessageText(ajudaMenu.text, ajudaMenu.buttons));
bot.action('help_close', (ctx) => ctx.deleteMessage());

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const userId = await getUserAuth(ctx);
  if (!userId) return ctx.reply('🔒 Conecte-se primeiro.');

  await ctx.sendChatAction('typing');

  let decisao = await rotearIntencao(ctx.message.text);
  if (decisao.intent === 'USE_AI') {
    decisao = await processarComIA(ctx.message.text);
  }

  switch (decisao.intent) {
    case 'ADD_TRANSACTION': await handleAddTransaction(ctx, userId, decisao.data); break;
    case 'DELETE_LAST': await handleDeleteLast(ctx, userId); break;
    case 'CHECK_BALANCE': await handleCheckBalance(ctx, userId); break; // Agora usa IA para análise
    case 'CHECK_BILLS': await handleCheckBills(ctx, userId); break;
    case 'CHAT_LOCAL': ctx.reply(decisao.reply); break;
    case 'CHAT': default: ctx.reply(decisao.reply_text || "🤔 Não entendi."); break;
  }
});

// --- 8. HANDLERS INTELIGENTES ---

async function handleAddTransaction(ctx, userId, data) {
  if (!data?.amount) return ctx.reply("❓ Qual o valor?");

  // 1. Categoria
  let categoryId = null;
  let categoryName = 'Geral';
  const { data: cat } = await supabase.from('categories').select('id, name').ilike('name', `%${data.category_guess}%`).limit(1).maybeSingle();
  if (cat) { categoryId = cat.id; categoryName = cat.name; }
  else {
    const { data: fallback } = await supabase.from('categories').select('id, name').limit(1).single();
    categoryId = fallback?.id;
  }

  // 2. Salvar
  const { error } = await supabase.from('transactions').insert({
    user_id: userId, description: data.description || "Via Bot", amount: data.amount, type: data.type, category_id: categoryId, date: new Date().toISOString()
  });

  if (error) return ctx.reply("❌ Erro ao salvar.");

  let extraMessage = "";

  // 3. SE FOR DESPESA: Alerta de Orçamento
  if (data.type === 'expense') {
    const { data: budget } = await supabase.from('budgets').select('limit_amount').eq('user_id', userId).eq('category_id', categoryId).maybeSingle();
    if (budget) {
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { data: trs } = await supabase.from('transactions').select('amount').eq('user_id', userId).eq('category_id', categoryId).eq('type', 'expense').gte('date', inicioMes);
      const total = trs.reduce((a, b) => a + Number(b.amount), 0);
      const pct = (total / budget.limit_amount) * 100;
      
      if (pct > 100) extraMessage = `\n\n🚨 **ESTOUROU:** Você passou o limite de ${categoryName}! (${pct.toFixed(0)}%)`;
      else if (pct >= 90) extraMessage = `\n\n⚠️ **Cuidado:** 90% do limite de ${categoryName} usado.`;
    }
  }

  // 4. SE FOR RECEITA: Sugestão de Meta (Coach Feature)
  if (data.type === 'income') {
    // Busca metas não concluídas
    const { data: goals } = await supabase.from('goals').select('*').eq('user_id', userId).lt('current_amount', supabase.raw('target_amount')).limit(1);
    
    if (goals && goals.length > 0) {
      const meta = goals[0];
      // Sugere guardar 10% ou 20%
      const sugestao = (data.amount * 0.10).toFixed(2);
      
      // Pede pra IA gerar uma frase de incentivo
      const promptIncentivo = `O usuário acabou de ganhar R$ ${data.amount}. Ele tem uma meta "${meta.title}". Gere uma frase curta (1 linha) sugerindo guardar R$ ${sugestao} para essa meta.`;
      try {
        const result = await model.generateContent(promptIncentivo);
        const frase = result.response.text();
        extraMessage = `\n\n🎯 **Dica do Coach:**\n${frase}`;
      } catch (e) {
        extraMessage = `\n\n🎯 **Dica:** Que tal guardar R$ ${sugestao} para a meta "${meta.title}"?`;
      }
    }
  }

  const comentario = data.smart_comment || "Registrado!";
  const emoji = data.type === 'expense' ? '💸' : '💰';

  ctx.reply(`${comentario}\n\n✅ **${data.description}**\n💲 R$ ${data.amount.toFixed(2)}\n${emoji} Categoria: ${categoryName}${extraMessage}`);
}

async function handleDeleteLast(ctx, userId) {
  const { data: last } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).single();
  if (!last) return ctx.reply("🚫 Nada para apagar.");
  await supabase.from('transactions').delete().eq('id', last.id);
  ctx.reply(`🗑️ **Apagado:** ${last.description} (R$ ${last.amount})`);
}

async function handleCheckBalance(ctx, userId) {
  await gerarRelatorioSaude(userId, ctx.chat.id.toString());
}

async function handleCheckBills(ctx, userId) {
  const dia = new Date().getDate();
  const { data: bills } = await supabase.from('recurring_bills').select('*').eq('user_id', userId).gte('due_day', dia).limit(5);
  if (!bills?.length) return ctx.reply("✅ Sem contas próximas.");
  let msg = `📅 **Próximas Contas:**\n`;
  bills.forEach(b => msg += `• ${b.description}: R$ ${b.amount} (Dia ${b.due_day})\n`);
  ctx.reply(msg);
}

// --- 9. FUNÇÃO CORE: RELATÓRIO DE SAÚDE (Usada no Cron e no Comando) ---
async function gerarRelatorioSaude(userId, chatId) {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();

  // 1. Coleta Dados
  const { data: transactions } = await supabase.from('transactions').select('*').eq('user_id', userId).gte('date', inicioMes);
  const { data: profile } = await supabase.from('profiles').select('monthly_income').eq('id', userId).single();
  const { data: goals } = await supabase.from('goals').select('title, current_amount, target_amount').eq('user_id', userId);
  const { data: bills } = await supabase.from('recurring_bills').select('*').eq('user_id', userId).eq('due_day', hoje.getDate());

  let receita = 0, despesa = 0;
  transactions.forEach(t => t.type === 'income' ? receita += t.amount : despesa += t.amount);
  const saldo = receita - despesa;
  const rendaPlanejada = profile?.monthly_income || 0;
  
  // 2. Monta Prompt para o Analista IA
  const promptAnalise = `
    Você é um Coach Financeiro Sincero e Motivador.
    Data: ${hoje.toLocaleDateString('pt-BR')}.
    
    DADOS DO USUÁRIO:
    - Renda Planejada: R$ ${rendaPlanejada}
    - Entradas Mês: R$ ${receita}
    - Gastos Mês: R$ ${despesa}
    - Saldo Atual: R$ ${saldo}
    - Contas vencendo hoje: ${bills?.length || 0}
    - Metas ativas: ${goals?.map(g => `${g.title} (${Math.round(g.current_amount/g.target_amount*100)}%)`).join(', ') || "Nenhuma"}

    TAREFA:
    Escreva um "Bom dia" curto (max 3 parágrafos curtos).
    1. Dê o resumo dos números (Saldo e Gastos).
    2. Analise a saúde: Se gastou muito, dê um puxão de orelha suave. Se está bem, parabenize.
    3. Cite uma meta específica para motivar.
    4. Se tiver contas vencendo hoje, avise com urgência.
    
    Use emojis. Fale em primeira pessoa ("Eu analisei...").
  `;

  try {
    const result = await model.generateContent(promptAnalise);
    const relatorio = result.response.text();
    bot.telegram.sendMessage(chatId, relatorio);
  } catch (error) {
    console.error("Erro ao gerar relatório IA", error);
    bot.telegram.sendMessage(chatId, `📊 **Resumo Básico:**\nSaldo: R$ ${saldo.toFixed(2)}\nGastos: R$ ${despesa.toFixed(2)}\n(IA Indisponível para análise completa)`);
  }
}

// --- 10. CRON JOBS ---

// ⏰ 08:00 AM - Relatório Matinal Completo
cron.schedule('0 8 * * *', async () => {
  console.log("☕ Iniciando Morning Briefing...");
  const { data: ints } = await supabase.from('user_integrations').select('*').not('telegram_chat_id', 'is', null);
  if (!ints) return;

  for (const user of ints) {
    await gerarRelatorioSaude(user.user_id, user.telegram_chat_id);
  }
}, { timezone: "America/Sao_Paulo" });

// Lançamento
bot.launch({ dropPendingUpdates: true, polling: { retryAfter: 2000, timeout: 30 } })
  .then(async () => {
    try {
      await bot.telegram.setMyCommands([
        { command: 'start', description: 'Reiniciar' },
        { command: 'ajuda', description: 'Menu Principal' },
        { command: 'saldo', description: 'Ver Relatório de Saúde' }
      ]);
    } catch(e) {}
    console.log('🚀 Bot Coach Financeiro Online!');
  })
  .catch((err) => {
    if (err.description && err.description.includes('Conflict')) process.exit(1);
    console.error(err);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));