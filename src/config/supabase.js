const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Tenta carregar o .env subindo 2 pastas (src/config -> src -> raiz)
// Isso garante que ele ache o arquivo mesmo rodando de pastas diferentes
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Fallback: Tenta carregar do diretório atual se o de cima falhar
if (!process.env.SUPABASE_URL) {
    require('dotenv').config();
}

// 2. Debug: Mostra no console se achou as variáveis (sem mostrar o valor real por segurança)
console.log('[DEBUG] Carregando variáveis de ambiente...');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Encontrada' : '❌ Não encontrada');
console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✅ Encontrada' : '❌ Não encontrada');

// 3. Pega os valores usando os nomes EXATOS que estão no seu .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Ajustado para SUPABASE_SERVICE_KEY

// 4. Validação
if (!supabaseUrl || !supabaseKey) {
    throw new Error('❌ Faltam variáveis no .env! Verifique SUPABASE_URL e SUPABASE_SERVICE_KEY.');
}

// 5. Cria o cliente
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;