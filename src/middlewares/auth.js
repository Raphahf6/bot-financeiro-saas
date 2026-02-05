const supabase = require('../config/supabase');
const { WEB_APP_URL } = require('../config/constants');

const authMiddleware = async (ctx, next) => {
  // Permite o comando de start com token passar direto
  if (ctx.message?.text?.startsWith('/start ')) return next();

  const telegramId = ctx.from.id.toString();
  
  // Verifica se existe o vinculo no banco
  const { data } = await supabase
    .from('user_integrations')
    .select('user_id')
    .eq('telegram_chat_id', telegramId)
    .maybeSingle();

  if (!data?.user_id) {
    // Mensagem Profissional com Link Direto
    return ctx.reply(
      '🔒 **Dispositivo Não Vinculado**\n\n' +
      'Para sua segurança, este bot só funciona vinculado à sua conta Finan.AI.\n\n' +
      '🛠 **Como conectar:**\n' +
      `1. Acesse o painel: ${WEB_APP_URL}\n` +
      '2. Vá em **Configurações > Integrações**\n' +
      '3. Clique em "Conectar Telegram"\n\n' +
      '_Dica: O site gerará um botão mágico para abrir este chat já conectado._', 
      { parse_mode: 'Markdown' }
    );
  }

  // Injeta o ID do usuário na sessão para uso nos controllers
  ctx.session = { userId: data.user_id };
  return next();
};

module.exports = authMiddleware;