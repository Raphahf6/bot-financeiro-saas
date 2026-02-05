const cron = require('node-cron');
const supabase = require('../config/supabase');

const initScheduler = (bot) => {
  console.log('⏰ Agendador de notificações iniciado (08:00 AM - SP)...');

  // Roda todos os dias às 08:00 da manhã (Horário de SP)
  cron.schedule('0 8 * * *', async () => {
    const today = new Date().getDate();
    
    // 1. Busca todos usuários que têm o bot conectado
    const { data: integrations } = await supabase
      .from('user_integrations')
      .select('user_id, telegram_chat_id')
      .not('telegram_chat_id', 'is', null);

    if (!integrations) return;

    // 2. Para cada usuário, verifica se tem conta vencendo hoje
    for (const integration of integrations) {
      const { data: bills } = await supabase
        .from('recurring_bills')
        .select('*')
        .eq('user_id', integration.user_id)
        .eq('due_day', today);

      if (bills && bills.length > 0) {
        let msg = `🔔 **Bom dia! Hoje vencem ${bills.length} contas:**\n\n`;
        let total = 0;
        
        bills.forEach(bill => {
          msg += `• ${bill.description}: R$ ${Number(bill.amount).toFixed(2)}\n`;
          total += Number(bill.amount);
        });
        
        msg += `\n💰 **Total: R$ ${total.toFixed(2)}**\n`;
        msg += `_Dica: Se já pagou, lance o gasto respondendo esta mensagem!_`;

        try {
          await bot.telegram.sendMessage(integration.telegram_chat_id, msg, { parse_mode: 'Markdown' });
        } catch (error) {
          console.error(`Erro ao enviar msg para ${integration.telegram_chat_id}`, error);
        }
      }
    }
  }, {
    timezone: "America/Sao_Paulo"
  });
};

module.exports = { initScheduler };