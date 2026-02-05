require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const supabase = require('./config/supabase');
const { MainMenu } = require('./utils/keyboards');
const authMiddleware = require('./middlewares/auth');
const transactionController = require('./controllers/transaction');
const reportController = require('./controllers/report');
const { initScheduler } = require('./services/scheduler');

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN não definido no .env');
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- SETUP ---
bot.use(session());

// --- COMANDO DE CONEXÃO (Start com Token) ---
bot.start(async (ctx) => {
  const args = ctx.message.text.split(' ');
  const token = args[1]; // Pega o token após /start
  
  // Se tiver token, tenta vincular
  if (token) {
    const { data } = await supabase.from('user_integrations').select('*').eq('connection_token', token).maybeSingle();
    
    if (data) {
      await supabase.from('user_integrations').update({ 
        telegram_chat_id: ctx.chat.id.toString(), 
        telegram_username: ctx.from.username || 'User', 
        connection_token: null // Limpa o token por segurança
      }).eq('id', data.id);

      return ctx.reply('✅ **Finan.AI Conectado com Sucesso!**\n\nSeu assistente financeiro está pronto para usar.', MainMenu);
    }
    return ctx.reply('❌ Token inválido ou expirado. Gere um novo no site.');
  }
  
  // Se for start normal sem token
  ctx.reply('👋 Olá! Sou o bot do Finan.AI.\n\nVocê precisa conectar sua conta pelo site primeiro.', MainMenu);
});

// --- MIDDLEWARE DE SEGURANÇA (Protege tudo abaixo) ---
bot.use(authMiddleware);

// --- MENU HANDLERS (Comandos de Texto) ---
bot.hears('📉 Novo Gasto', ctx => ctx.reply('✍️ Digite o valor e o nome.\nEx: `45 pizza` ou `200 luz`', { parse_mode: 'Markdown' }));
bot.hears('📈 Nova Entrada', ctx => ctx.reply('✍️ Digite "ganhei" valor e origem.\nEx: `ganhei 500 freela`', { parse_mode: 'Markdown' }));

// Handlers de Relatório
bot.hears('💰 Ver Saldo', reportController.handleBalance); 
bot.hears('📄 Extrato', reportController.handleExtract);
bot.hears('📅 Contas Fixas', reportController.handleBills); 
bot.hears('🎯 Metas', reportController.handleGoals); 

// --- FLUXO DE TRANSAÇÃO (TEXTO LIVRE) ---
bot.on('text', transactionController.handleMessage);

// --- AÇÕES DE BOTÕES (CALLBACKS) ---
bot.action(/^undo_/, transactionController.undoTransaction);
bot.action('view_balance', reportController.handleBalance);
bot.action('view_extract', reportController.handleExtract);
// bot.action('deposit_goal...', ...); // Implementar lógica de depósito em metas futuramente

// --- SERVIÇOS AGENDADOS ---
initScheduler(bot);

// --- INICIALIZAÇÃO ---
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('🚀 Finan.AI Bot Profissional Online!'))
  .catch((err) => console.error('Erro ao iniciar bot:', err));

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));