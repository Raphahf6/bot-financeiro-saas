require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// Verificação de segurança inicial
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ ERRO: Variáveis de ambiente (.env) não configuradas corretamente.');
  process.exit(1);
}

// Inicialização dos Clientes
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

console.log('🤖 Bot Financeiro Iniciando...');

// --- COMANDO: /start (O Aperto de Mão) ---
bot.start(async (ctx) => {
  const message = ctx.message.text; // Ex: "/start CONNECT-1234"
  const args = message.split(' ');
  const telegramChatId = ctx.chat.id.toString();
  const firstName = ctx.from.first_name || 'Usuário';
  const username = ctx.from.username || 'SemUsername';

  // 1. Se o usuário mandou apenas "/start" (sem token)
  if (args.length < 2) {
    return ctx.reply(
      `Olá, ${firstName}! 👋\n\n` +
      `Eu sou seu Assistente Financeiro IA.\n\n` +
      `Para me conectar à sua conta, você precisa ir no painel Web, copiar seu código de conexão e enviar aqui.\n\n` +
      `Exemplo:\n` +
      `/start CONNECT-1234`
    );
  }

  const token = args[1].trim(); // O código: CONNECT-1234

  try {
    ctx.reply('🔄 Verificando seu token de conexão...');

    // 2. Busca no banco quem gerou esse token
    const { data: integration, error } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('connection_token', token)
      .single();

    if (error || !integration) {
      console.log(`Tentativa falha de conexão com token: ${token}`);
      return ctx.reply('❌ Token inválido ou expirado. Por favor, gere um novo código no site e tente novamente.');
    }

    // 3. Vínculo encontrado! Atualiza o Chat ID e limpa o token usado
    const { error: updateError } = await supabase
      .from('user_integrations')
      .update({
        telegram_chat_id: telegramChatId,
        telegram_username: username,
        connection_token: null // Token é descartável, segurança máxima
      })
      .eq('id', integration.id);

    if (updateError) throw updateError;

    // 4. Sucesso! Busca o nome do perfil para dar um oi personalizado
    const { data: profile } = await supabase
      .from('profiles')
      .select('monthly_income')
      .eq('id', integration.user_id)
      .single();

    const rendaFormatada = profile?.monthly_income 
      ? `R$ ${profile.monthly_income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
      : 'Não configurada';

    await ctx.reply(
      `✅ **Conexão Realizada com Sucesso!**\n\n` +
      `Olá novamente, ${firstName}! Agora seu Telegram está vinculado à sua conta financeira.\n\n` +
      `📊 **Status Atual:**\n` +
      `• Renda Configurada: ${rendaFormatada}\n` +
      `• ID de Conexão: Protegido 🔒\n\n` +
      `A partir de agora, eu te avisarei sempre que uma conta estiver prestes a vencer.`
    );

    console.log(`✅ Usuário ${username} (${telegramChatId}) conectado via token ${token}`);

  } catch (err) {
    console.error('Erro no processo de conexão:', err);
    ctx.reply('⚠️ Ocorreu um erro interno ao tentar conectar. Tente novamente mais tarde.');
  }
});

// --- COMANDO: /status (Teste rápido) ---
bot.command('status', async (ctx) => {
  const telegramChatId = ctx.chat.id.toString();

  // Verifica se o usuário já está conectado
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('user_id')
    .eq('telegram_chat_id', telegramChatId)
    .single();

  if (!integration) {
    return ctx.reply('Você ainda não está conectado. Use o comando /start SEU-TOKEN para começar.');
  }

  ctx.reply('✅ Sistema Operacional. Você está conectado e pronto para receber alertas.');
});

// Inicia o loop do bot
bot.launch();

// Tratamento de Encerramento (Graceful Stop)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));