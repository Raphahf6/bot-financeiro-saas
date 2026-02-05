const supabase = require('../config/supabase');

// Função Mágica: Descobre o UUID do usuário pelo Telegram ID
async function getUserAuth(ctx) {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId) return null;

    // Busca na tabela de integrações quem é o dono desse Telegram
    const { data: integration } = await supabase
        .from('user_integrations')
        .select('user_id')
        .eq('telegram_chat_id', chatId)
        .single();

    return integration?.user_id || null;
}

function parseValue(valStr) {
    if (!valStr) return 0;
    return parseFloat(valStr.replace(',', '.'));
}

module.exports = { getUserAuth, parseValue };