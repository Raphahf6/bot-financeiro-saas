const supabase = require('../config/supabase');

// Converte texto "1.200,50" ou "50" para float JS (1200.50)
function parseValue(str) {
  if (!str) return 0;
  return parseFloat(str.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
}

// Verifica se o usuário do Telegram está vinculado ao sistema
async function getUserAuth(ctx) {
  const telegramChatId = ctx.chat.id.toString();
  const { data } = await supabase
    .from('user_integrations')
    .select('user_id')
    .eq('telegram_chat_id', telegramChatId)
    .single();
    
  return data ? data.user_id : null;
}

module.exports = { parseValue, getUserAuth };