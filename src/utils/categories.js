const supabase = require('../config/supabase');

const KEYWORDS = {
  'Alimentação': ['pizza', 'burger', 'ifood', 'mercado', 'açougue', 'padaria', 'almoço', 'jantar', 'lanche', 'cafe', 'restaurante', 'bar', 'cerveja', 'comida', 'agua'],
  'Transporte': ['uber', '99', 'taxi', 'combustivel', 'gasolina', 'alcool', 'posto', 'estacionamento', 'onibus', 'metro', 'pedagio', 'multa', 'carro', 'moto'],
  'Lazer': ['cinema', 'netflix', 'spotify', 'jogo', 'steam', 'viagem', 'hotel', 'show', 'ingresso', 'passeio', 'clube'],
  'Moradia': ['aluguel', 'condominio', 'luz', 'energia', 'internet', 'wifi', 'gas', 'iptu', 'reforma', 'moveis', 'casa'],
  'Saúde': ['farmacia', 'remedio', 'medico', 'dentista', 'psicologo', 'exame', 'academia', 'suplemento', 'hospital'],
  'Educação': ['curso', 'livro', 'faculdade', 'escola', 'udemy', 'alura', 'material'],
  'Serviços': ['assinatura', 'amazon', 'celular', 'manicure', 'cabelo', 'barbeiro', 'limpeza']
};

async function detectCategory(text) {
  const cleanText = text.toLowerCase();
  
  // 1. Tenta match local por palavras-chave
  let foundCategory = 'Geral'; 
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    if (words.some(w => cleanText.includes(w))) {
      foundCategory = cat;
      break;
    }
  }

  // 2. Busca o ID correto no banco de dados
  const { data } = await supabase.from('categories')
    .select('id, name')
    .ilike('name', foundCategory)
    .maybeSingle();

  if (data) return { id: data.id, name: data.name };

  // 3. Fallback: Pega a categoria 'Outros' ou a primeira que existir
  const { data: fallback } = await supabase.from('categories').select('id, name').limit(1).single();
  return fallback || { id: null, name: 'Geral' };
}

module.exports = { detectCategory };