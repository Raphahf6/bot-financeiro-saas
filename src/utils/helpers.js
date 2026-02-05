const supabase = require('../config/supabase');

// Busca o UUID do usuário baseado no ID do Telegram
const getAuthenticatedUser = async (telegramChatId) => {
    const { data, error } = await supabase
        .from('user_integrations')
        .select('user_id')
        .eq('telegram_chat_id', telegramChatId.toString())
        .single();

    if (error || !data) return null;
    return data.user_id; // Retorna o UUID (ex: a0eebc...)
};

const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

module.exports = { getAuthenticatedUser, formatCurrency, formatDate };