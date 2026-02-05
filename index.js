require('dotenv').config();
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron'); // Importa o agendador

// Verificação de segurança
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ ERRO: Variáveis de ambiente (.env) não configuradas.');
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

console.log('🤖 Bot Financeiro Operacional...');

// --- COMANDO: /start (Conexão) ---
bot.start(async (ctx) => {
  const message = ctx.message.text; 
  const args = message.split(' ');
  const telegramChatId = ctx.chat.id.toString();
  const firstName = ctx.from.first_name || 'Usuário';

  if (args.length < 2) {
    return ctx.reply(`Olá, ${firstName}! Para conectar, gere seu token no site e envie: /start SEU-TOKEN`);
  }

  const token = args[1].trim();

  try {
    const { data: integration, error } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('connection_token', token)
      .single();

    if (error || !integration) {
      return ctx.reply('❌ Token inválido ou expirado. Gere um novo no site.');
    }

    await supabase
      .from('user_integrations')
      .update({
        telegram_chat_id: telegramChatId,
        telegram_username: ctx.from.username,
        connection_token: null 
      })
      .eq('id', integration.id);

    ctx.reply(`✅ Conectado com sucesso, ${firstName}! Agora eu vou te avisar das suas contas.`);
    console.log(`✅ Usuário ${firstName} conectado.`);

  } catch (err) {
    console.error(err);
    ctx.reply('Erro ao conectar. Tente novamente.');
  }
});

// --- COMANDO: /hoje (Verificação manual) ---
bot.command('hoje', async (ctx) => {
  await checarContasUsuario(ctx.chat.id.toString(), ctx);
});

// --- SISTEMA DE AGENDAMENTO (CRON JOB) ---
// Roda todos os dias às 09:00 da manhã
cron.schedule('0 9 * * *', async () => {
  console.log('⏰ Iniciando verificação diária de contas...');
  
  // 1. Busca todos os usuários conectados
  const { data: integrations } = await supabase
    .from('user_integrations')
    .select('*')
    .not('telegram_chat_id', 'is', null);

  if (!integrations) return;

  // 2. Verifica contas para cada usuário
  for (const user of integrations) {
    try {
      await checarContasUsuario(user.telegram_chat_id, bot.telegram, user.user_id);
    } catch (err) {
      console.error(`Erro ao processar usuário ${user.user_id}:`, err);
    }
  }
});

// --- FUNÇÃO CORE: Checar Contas ---
async function checarContasUsuario(telegramChatId, telegramInterface, userId = null) {
  // Se o userId não for passado, buscamos pelo chatId
  let targetUserId = userId;
  
  if (!targetUserId) {
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('user_id')
      .eq('telegram_chat_id', telegramChatId)
      .single();
    if (!integration) return telegramInterface.sendMessage(telegramChatId, "Você não está conectado.");
    targetUserId = integration.user_id;
  }

  const hoje = new Date();
  const diaHoje = hoje.getDate(); // Ex: 5

  // Busca contas que vencem hoje
  const { data: bills } = await supabase
    .from('recurring_bills')
    .select('*')
    .eq('user_id', targetUserId)
    .eq('due_day', diaHoje);

  if (bills && bills.length > 0) {
    let msg = `📅 **Atenção! Contas vencendo hoje (Dia ${diaHoje}):**\n\n`;
    let total = 0;

    bills.forEach(bill => {
      msg += `• ${bill.description}: R$ ${bill.amount}\n`;
      total += parseFloat(bill.amount);
    });

    msg += `\n💰 **Total a pagar:** R$ ${total.toFixed(2)}`;
    msg += `\n\nNão esqueça de pagar para evitar juros!`;

    // Envia a mensagem (seja via ctx ou via bot.telegram direto)
    if (telegramInterface.sendMessage) {
        await telegramInterface.sendMessage(telegramChatId, msg);
    } else {
        await telegramInterface.reply(msg);
    }
  } else {
    // Se for comando manual (/hoje), avisa que não tem nada. Se for automático, fica quieto.
    if (telegramInterface.reply) {
        telegramInterface.reply(`✨ Nenhuma conta fixa vence hoje (Dia ${diaHoje}).`);
    }
  }
}

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));