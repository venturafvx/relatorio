'use strict';
const { normName } = require('./format');

// Regiões do RJ (São Fidélis no Noroeste, como nos relatórios da agência). Para outros estados, use a coluna "regiao" no CSV.
const REGIONS = {
  RJ: {
    'Região Metropolitana': ['Rio de Janeiro', 'Belford Roxo', 'Duque de Caxias', 'Guapimirim', 'Itaboraí', 'Itaguaí', 'Japeri', 'Magé', 'Maricá', 'Mesquita', 'Nilópolis', 'Niterói', 'Nova Iguaçu', 'Paracambi', 'Queimados', 'São Gonçalo', 'São João de Meriti', 'Seropédica', 'Tanguá'],
    'Norte Fluminense': ['Campos dos Goytacazes', 'Carapebus', 'Cardoso Moreira', 'Conceição de Macabu', 'Macaé', 'Quissamã', 'São Francisco de Itabapoana', 'São João da Barra'],
    'Noroeste Fluminense': ['Aperibé', 'Bom Jesus do Itabapoana', 'Cambuci', 'Italva', 'Itaocara', 'Itaperuna', 'Laje do Muriaé', 'Miracema', 'Natividade', 'Porciúncula', 'Santo Antônio de Pádua', 'São Fidélis', 'São José de Ubá', 'Varre-Sai'],
    'Região Serrana': ['Bom Jardim', 'Cantagalo', 'Carmo', 'Cordeiro', 'Duas Barras', 'Macuco', 'Nova Friburgo', 'Petrópolis', 'Santa Maria Madalena', 'São José do Vale do Rio Preto', 'São Sebastião do Alto', 'Sumidouro', 'Teresópolis', 'Trajano de Moraes'],
    'Baixadas Litorâneas': ['Araruama', 'Armação dos Búzios', 'Arraial do Cabo', 'Cabo Frio', 'Cachoeiras de Macacu', 'Casimiro de Abreu', 'Iguaba Grande', 'Rio Bonito', 'Rio das Ostras', 'São Pedro da Aldeia', 'Saquarema', 'Silva Jardim'],
    'Médio Paraíba': ['Barra do Piraí', 'Barra Mansa', 'Itatiaia', 'Pinheiral', 'Piraí', 'Porto Real', 'Quatis', 'Resende', 'Rio Claro', 'Rio das Flores', 'Valença', 'Volta Redonda'],
    'Centro-Sul Fluminense': ['Areal', 'Comendador Levy Gasparian', 'Engenheiro Paulo de Frontin', 'Mendes', 'Miguel Pereira', 'Paraíba do Sul', 'Paty do Alferes', 'Sapucaia', 'Três Rios', 'Vassouras'],
    'Costa Verde': ['Angra dos Reis', 'Mangaratiba', 'Paraty'],
  },
};

const lookup = {};
for (const [uf, regs] of Object.entries(REGIONS)) {
  lookup[uf] = new Map();
  for (const [reg, muns] of Object.entries(regs)) {
    for (const m of muns) lookup[uf].set(normName(m), reg);
  }
}

function regionFor(uf, mun) {
  const m = lookup[String(uf || '').toUpperCase()];
  return (m && m.get(normName(mun))) || '';
}

const UFS = {
  AC: ['Acre', 22], AL: ['Alagoas', 102], AP: ['Amapá', 16], AM: ['Amazonas', 62], BA: ['Bahia', 417],
  CE: ['Ceará', 184], DF: ['Distrito Federal', 1], ES: ['Espírito Santo', 78], GO: ['Goiás', 246],
  MA: ['Maranhão', 217], MT: ['Mato Grosso', 142], MS: ['Mato Grosso do Sul', 79], MG: ['Minas Gerais', 853],
  PA: ['Pará', 144], PB: ['Paraíba', 223], PR: ['Paraná', 399], PE: ['Pernambuco', 185], PI: ['Piauí', 224],
  RJ: ['Rio de Janeiro', 92], RN: ['Rio Grande do Norte', 167], RS: ['Rio Grande do Sul', 497],
  RO: ['Rondônia', 52], RR: ['Roraima', 15], SC: ['Santa Catarina', 295], SP: ['São Paulo', 645],
  SE: ['Sergipe', 75], TO: ['Tocantins', 139],
};

module.exports = { regionFor, UFS };
