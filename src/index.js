require('dotenv').config();
const { Telegraf } = require('telegraf');
const http = require('http');
const cron = require('node-cron');
const supabase = require('./config/supabase');

const reports = require('./controllers/reports');
const inputs = require('./controllers/inputs');
const { MainMenu } = require('./utils/keyboards'); // Importa o menu

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
console.log('🤖 Bot Finan.AI 2.0 Iniciado...');

// --- COMANDO START (Autenticação) ---
bot.start(async (ctx) => {
  const args = ctx.message.text.split(' ');
  const token = args[1]?.trim();

  if (!token) {
    return ctx.reply(
      `👋 **Bem-vindo ao Finan.AI!**\n\nPara conectar sua conta:\n1. Acesse o sistema web\n2. Vá em Configurações > Integrações\n3. Clique em "Conectar Telegram"`,
      { parse_mode: 'Markdown' }
    );
  }

  const { data: integration } = await supabase.from('user_integrations').select('*').eq('connection_token', token).single();
  
  if (!integration) return ctx.reply('❌ Token inválido ou expirado.');
  
  await supabase.from('user_integrations').update({ 
    telegram_chat_id: ctx.chat.id.toString(), 
    telegram_username: ctx.from.username, 
    connection_token: null 
  }).eq('id', integration.id);
  
  ctx.reply(
    `✅ **Conectado com sucesso!**\nAgora você pode usar o menu abaixo para controlar suas finanças.`,
    MainMenu // Mostra o teclado
  );
});

// --- MENU HANDLERS ---
bot.hears('📉 Registrar Gasto', ctx => ctx.reply('Digite o valor e o nome. Ex: `45 pizza`', { parse_mode: 'Markdown' }));
bot.hears('📈 Registrar Ganho', ctx => ctx.reply('Digite o valor e a origem. Ex: `ganhei 100 pix`', { parse_mode: 'Markdown' }));
bot.hears('📊 Ver Saldo', reports.handleSaldo);
bot.hears('📝 Extrato', reports.handleExtrato);
bot.hears('❓ Ajuda', ctx => ctx.reply(
  `🤖 **Comandos Rápidos:**\n\n` +
  `• Digite apenas o valor e o item para gastar: \n   Ex: _30 padaria_\n` +
  `• Para ganhos, use 'ganhei' ou 'recebi':\n   Ex: _ganhei 500 freela_\n\n` +
  `Use o menu abaixo para navegar.`,
  { parse_mode: 'Markdown' }
));
bot.hears('🎯 Metas', async (ctx) => {
    // Busca simples de metas para exibir
    const userId = await require('./utils/helpers').getUserAuth(ctx);
    if(!userId) return;
    const { data: goals } = await supabase.from('goals').select('*').eq('user_id', userId);
    if(!goals.length) return ctx.reply("Você não tem metas cadastradas.");
    let msg = "🎯 **Suas Metas:**\n\n";
    goals.forEach(g => {
        const pct = Math.round((g.current_amount / g.target_amount) * 100);
        msg += `• ${g.name}: R$ ${g.current_amount} / ${g.target_amount} (${pct}%)\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown' });
});

// --- AÇÕES DE BOTÕES (CALLBACKS) ---
bot.action(/^undo_/, reports.handleCallbackUndo); // Captura cliques no botão "Desfazer"

// --- TEXTO LIVRE ---
bot.on('text', inputs.handleMessage);

// --- SERVIDOR HTTP (Keep Alive) ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200); res.end('Finan.AI Bot Online'); }).listen(PORT);

// --- INICIALIZAÇÃO ---
bot.launch({ dropPendingUpdates: true });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));