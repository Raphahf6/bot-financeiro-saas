const supabase = require('../config/supabase');

const CATEGORY_KEYWORDS = {
  'Alimentação': ['pizza', 'ifood', 'burguer', 'hamburguer', 'mercado', 'açougue', 'padaria', 'restaurante', 'almoço', 'jantar', 'lanche', 'cafe', 'café'],
  'Transporte': ['uber', '99', 'taxi', 'onibus', 'metrô', 'gasolina', 'posto', 'combustivel', 'estacionamento'],
  'Lazer': ['cinema', 'netflix', 'spotify', 'jogo', 'steam', 'bar', 'shopping', 'viagem'],
  'Moradia': ['luz', 'agua', 'água', 'internet', 'aluguel', 'condominio', 'gas'],
  'Saúde': ['farmacia', 'remedio', 'medico', 'dentista', 'academia', 'suplemento'],
  'Trabalho': ['equipamento', 'curso', 'livro', 'escritorio']
};

async function guessCategory(description) {
  const desc = description.toLowerCase();
  
  // 1. Tenta achar no dicionário local
  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => desc.includes(k))) {
      return catName;
    }
  }
  return 'Geral'; // Padrão se não achar
}

// Busca o ID da categoria no banco baseado no nome (ou retorna ID de uma padrão)
async function getCategoryId(categoryName) {
  const { data: cat } = await supabase.from('categories').select('id').ilike('name', `%${categoryName}%`).limit(1).maybeSingle();
  
  if (cat) return cat.id;
  
  // Fallback
  const { data: fb } = await supabase.from('categories').select('id').limit(1).single();
  return fb?.id;
}

module.exports = { guessCategory, getCategoryId };