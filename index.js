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
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

console.log('🚀 Bot Financeiro (Módulo Metas Ativado) Iniciado...');

// --- 3. MENU DE AJUDA ---
const ajudaMenu = {
  text: `🎓 **Central do Coach Financeiro**\n\nAgora posso gerenciar suas metas também!\n\nSelecione:`,
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
  
  // Regex Específico para Metas (Para economizar IA se for óbvio, mas vamos deixar a IA lidar com a complexidade de extração)
  if (t.match(/(nova meta|criar meta|definir meta)/)) return { intent: 'USE_AI' }; // IA extrai melhor o nome e valor
  if (t.match(/(guardar|investir|depositar|pôr|colocar).*meta/)) return { intent: 'USE_AI' };

  if (t.match(/(saldo|resumo|quanto.*gastei|gastos.*mes|fatura|balan[çc]o|saude|saúde)/)) return { intent: 'CHECK_BALANCE' };
  if (t.match(/(conta|boleto|pagar|vencendo|vence|hoje|amanh[ãa])/)) return { intent: 'CHECK_BILLS' };
  if (t.match(/(apaga|exclui|deleta|desfaz|remover|tira).*ultim[oa]/)) return { intent: 'DELETE_LAST' };
  if (t.match(/^(oi|ol[áa]|bom dia|boa tarde|boa noite|eai|opa)$/)) return { intent: 'CHAT_LOCAL', reply: "Olá! 👋 Sou seu Coach. Vamos bater metas hoje?" };
  
  return { intent: 'USE_AI' };
}

// --- 5. CÉREBRO IA (Agora entende Metas) ---
async function processarComIA(mensagemTexto) {
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  
  const prompt = `
    Hoje: ${dataHoje}.
    Analise: "${mensagemTexto}".
    
    Identifique a intenção entre: 
    - ADD_TRANSACTION (Gastar, Ganhar salário)
    - CREATE_GOAL (Criar nova meta)
    - ADD_TO_GOAL (Guardar dinheiro numa meta existente)
    - DELETE_LAST
    - CHAT

    REGRAS DE EXTRAÇÃO:
    1. Se ADD_TRANSACTION: type (expense/income), amount, description, category_guess, smart_comment.
    2. Se CREATE_GOAL: 
       - title (Nome da meta)
       - target_amount (Valor alvo, se não tiver assuma 0)
    3. Se ADD_TO_GOAL:
       - goal_name_guess (Nome da meta para buscar)
       - amount (Valor a guardar)
    
    Responda JSON puro:
    {
      "intent": "ADD_TRANSACTION" | "CREATE_GOAL" | "ADD_TO_GOAL" | "DELETE_LAST" | "CHAT",
      "data": { 
        "type": "expense" | "income", 
        "amount": 0.00, 
        "description": "string", 
        "category_guess": "string",
        "smart_comment": "string",
        "title": "string",           // Para CREATE_GOAL
        "target_amount": 0.00,       // Para CREATE_GOAL
        "goal_name_guess": "string"  // Para ADD_TO_GOAL
      },
      "reply_text": "string"
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text().replace(/```json|```/g, '').trim();
    const json = JSON.parse(text);
    
    // Sanitização de valor numérico geral
    ['amount', 'target_amount'].forEach(field => {
        if (json.data?.[field] && typeof json.data[field] === 'string') {
            json.data[field] = parseFloat(json.data[field].replace('R$', '').replace(',', '.').trim());
        }
    });

    return json;
  } catch (error) {
    console.error("Erro IA:", error);
    return { intent: "CHAT", reply_text: "Não entendi. Tente 'Nova meta Carro 20k' ou 'Gastei 50'." };
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
  ctx.reply(`✅ **Conectado!** Agora sou seu Gerente de Metas e Gastos.`);
});

bot.command('ajuda', async (ctx) => ctx.reply(ajudaMenu.text, ajudaMenu.buttons));
// Callbacks
bot.action('help_metas', (ctx) => ctx.editMessageText(`🎯 **Gerenciar Metas**\n\n• Criar: "Nova meta Viagem 5000"\n• Guardar: "Guardar 200 na Viagem"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
bot.action('help_gastos', (ctx) => ctx.editMessageText(`💸 **Lançar Gastos**\nEx: "Gastei 50 no Uber"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
bot.action('help_ganhos', (ctx) => ctx.editMessageText(`💰 **Lançar Ganhos**\nEx: "Recebi 500"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
bot.action('help_consultas', (ctx) => ctx.editMessageText(`📊 **Saúde Financeira**\nEx: "Saldo" ou "Resumo"`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'help_main')]])));
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
    case 'CREATE_GOAL': await handleCreateGoal(ctx, userId, decisao.data); break; // NOVO
    case 'ADD_TO_GOAL': await handleAddToGoal(ctx, userId, decisao.data); break; // NOVO
    case 'ADD_TRANSACTION': await handleAddTransaction(ctx, userId, decisao.data); break;
    case 'DELETE_LAST': await handleDeleteLast(ctx, userId); break;
    case 'CHECK_BALANCE': await handleCheckBalance(ctx, userId); break;
    case 'CHECK_BILLS': await handleCheckBills(ctx, userId); break;
    case 'CHAT_LOCAL': ctx.reply(decisao.reply); break;
    case 'CHAT': default: ctx.reply(decisao.reply_text || "🤔 Não entendi."); break;
  }
});

// --- 8. HANDLERS (NOVOS E ANTIGOS) ---

// 🆕 CRIAR META
async function handleCreateGoal(ctx, userId, data) {
  if (!data.title) return ctx.reply("❓ Qual o nome da meta? Ex: 'Nova meta Carro'");
  
  const { error } = await supabase.from('goals').insert({
    user_id: userId,
    title: data.title,
    target_amount: data.target_amount || 0,
    current_amount: 0,
    deadline: null // Opcional, por enquanto deixamos null
  });

  if (error) return ctx.reply("❌ Erro ao criar meta.");
  
  ctx.reply(`🎯 **Meta Criada!**\n\nObjetivo: **${data.title}**\nAlvo: R$ ${data.target_amount.toFixed(2)}\n\nBora economizar! 🚀`);
}

// 🆕 ADICIONAR DINHEIRO NA META
async function handleAddToGoal(ctx, userId, data) {
  if (!data.amount || !data.goal_name_guess) return ctx.reply("❓ Quanto e em qual meta? Ex: 'Guardar 100 no Carro'");

  // 1. Busca a meta pelo nome (Busca aproximada)
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .ilike('title', `%${data.goal_name_guess}%`)
    .limit(1);

  if (!goals || goals.length === 0) {
    return ctx.reply(`⚠️ Não achei a meta "${data.goal_name_guess}". Tente criar primeiro: "Nova meta ${data.goal_name_guess} 5000".`);
  }

  const meta = goals[0];
  const novoValor = Number(meta.current_amount) + Number(data.amount);

  // 2. Atualiza a meta
  const { error } = await supabase
    .from('goals')
    .update({ current_amount: novoValor })
    .eq('id', meta.id);

  if (error) return ctx.reply("❌ Erro ao atualizar meta.");

  // 3. Feedback Motivacional
  const progresso = meta.target_amount > 0 ? (novoValor / meta.target_amount) * 100 : 0;
  const falta = Math.max(0, meta.target_amount - novoValor);
  
  ctx.reply(
    `💰 **Depósito Confirmado!**\n\n` +
    `Meta: **${meta.title}**\n` +
    `+ R$ ${data.amount.toFixed(2)}\n` +
    `───────────────\n` +
    `📈 Total: R$ ${novoValor.toFixed(2)} (${progresso.toFixed(1)}%)\n` +
    `🏁 Falta: R$ ${falta.toFixed(2)}`
  );
}

// (ANTIGO) Adicionar Transação
async function handleAddTransaction(ctx, userId, data) {
  if (!data?.amount) return ctx.reply("❓ Qual o valor?");

  let categoryId = null;
  let categoryName = 'Geral';
  const { data: cat } = await supabase.from('categories').select('id, name').ilike('name', `%${data.category_guess}%`).limit(1).maybeSingle();
  if (cat) { categoryId = cat.id; categoryName = cat.name; }
  else {
    const { data: fallback } = await supabase.from('categories').select('id, name').limit(1).single();
    categoryId = fallback?.id;
  }

  const { error } = await supabase.from('transactions').insert({
    user_id: userId, description: data.description || "Via Bot", amount: data.amount, type: data.type, category_id: categoryId, date: new Date().toISOString()
  });

  if (error) return ctx.reply("❌ Erro ao salvar.");

  let extraMessage = "";
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

  if (data.type === 'income') {
    // Sugestão de Meta
    const { data: goals } = await supabase.from('goals').select('*').eq('user_id', userId).lt('current_amount', supabase.raw('target_amount')).limit(1);
    if (goals && goals.length > 0) {
      const meta = goals[0];
      const sugestao = (data.amount * 0.10).toFixed(2);
      extraMessage = `\n\n🎯 **Coach:** Que tal guardar R$ ${sugestao} na meta "${meta.title}"? Digite "Guardar ${sugestao} na ${meta.title}"`;
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

async function gerarRelatorioSaude(userId, chatId) {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
  const { data: transactions } = await supabase.from('transactions').select('*').eq('user_id', userId).gte('date', inicioMes);
  const { data: profile } = await supabase.from('profiles').select('monthly_income').eq('id', userId).single();
  const { data: goals } = await supabase.from('goals').select('title, current_amount, target_amount').eq('user_id', userId);
  const { data: bills } = await supabase.from('recurring_bills').select('*').eq('user_id', userId).eq('due_day', hoje.getDate());

  let receita = 0, despesa = 0;
  transactions.forEach(t => t.type === 'income' ? receita += t.amount : despesa += t.amount);
  const saldo = receita - despesa;
  
  const promptAnalise = `
    Coach Financeiro IA. Data: ${hoje.toLocaleDateString()}.
    DADOS: Renda: ${profile?.monthly_income}, Receita: ${receita}, Despesa: ${despesa}, Saldo: ${saldo}, Contas Hoje: ${bills?.length}, Metas: ${JSON.stringify(goals)}.
    
    Escreva um "Bom dia" curto e motivador.
    1. Resuma os números.
    2. Comente sobre o progresso das metas.
    3. Avise contas.
  `;

  try {
    const result = await model.generateContent(promptAnalise);
    bot.telegram.sendMessage(chatId, result.response.text());
  } catch (error) {
    bot.telegram.sendMessage(chatId, `📊 **Resumo:**\nSaldo: R$ ${saldo.toFixed(2)}\nMetas Ativas: ${goals?.length || 0}`);
  }
}

// CRON (08:00)
cron.schedule('0 8 * * *', async () => {
  const { data: ints } = await supabase.from('user_integrations').select('*').not('telegram_chat_id', 'is', null);
  if (!ints) return;
  for (const user of ints) await gerarRelatorioSaude(user.user_id, user.telegram_chat_id);
}, { timezone: "America/Sao_Paulo" });

// START
bot.launch({ dropPendingUpdates: true, polling: { retryAfter: 2000, timeout: 30 } })
  .then(async () => {
    try {
      await bot.telegram.setMyCommands([
        { command: 'start', description: 'Reiniciar' },
        { command: 'ajuda', description: 'Menu Principal' },
        { command: 'saldo', description: 'Relatório Completo' }
      ]);
    } catch(e) {}
    console.log('✅ Bot Metas + Coach Online!');
  })
  .catch((err) => { if (err.description?.includes('Conflict')) process.exit(1); });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));