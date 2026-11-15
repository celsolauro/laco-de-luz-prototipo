(function (global) {
  'use strict';

  const CONFIG = {
    titulo: 'Laço de Luz',
    programa: 'Estação Natal Jaguariúna 2026',
    linha: 'A cidade se ilumina. A gente se encontra.',
    assinatura: 'Secretaria Municipal de Cultura · Prefeitura de Jaguariúna',
    sloganCidade: 'Capital Country do Brasil',
    programacao: {
      periodo: '19/11 a 23/12/2026',
      linhaCard: '19/11 a 23/12 · Centro Cultural e Praça Umbelina Bueno',
      abertura: {
        data: '19/11',
        weekday: 'quinta',
        hora: '19h',
        local: 'Centro Cultural',
        atracoes: [
          'Chegada do Papai Noel na Maria Fumaça',
          'Concerto de Natal com a Orquestra Violeiros do Jaguary',
        ],
      },
      papaiNoel: 'Papai Noel recebe as crianças das 18h às 22h, no Centro Cultural e na Praça Umbelina Bueno, em vários dias da programação.',
      primeiraSemana: [
        { data: '20, 21 e 22/11', itens: ['Papai Noel, 18h–22h, Centro Cultural', 'Street Band, 19h, Centro Cultural'] },
        { data: '26/11', itens: ['SomBR e convidados, 19h'] },
        { data: '27/11', itens: ['Grupo Espaço Lis Coradi, 19h'] },
        { data: '28/11', itens: ['apresentação musical, 19h'] },
        { data: '29/11', itens: ['Café com Viola especial de Natal, 9h, Estação de Guedes', 'Banda Municipal, 19h, Centro Cultural'] },
      ],
      destaques: [
        'Paradas de Natal',
        'Festival de Corais da RMC',
        'Festival Dança Jaguary',
        'Banda Municipal Maestro Paulo de Moraes Penteado',
        'Street Band',
        'Grande Feira de Arte e Artesanato (encerra a programação)',
      ],
    },
    tempoTotalSegundos: 90,
    tempoPorFaseSegundos: 30,
    fases: [
      {
        id: 'boulevard',
        nome: 'Boulevard do Centro Cultural',
        subtitulo: 'Boulevard Pedro Abrucêz',
        backdrop: 'assets/fases/fase-1.webp',
        alvos: [
          { id: 'boulevard-norte', x: 0.56, y: 0.21, r: 0.085, pontos: 100, rotulo: 'Luzes do boulevard' },
          { id: 'casa-papai-noel', x: 0.175, y: 0.30, r: 0.09, pontos: 130, rotulo: 'Casa do Papai Noel' },
          { id: 'mural-trem', x: 0.155, y: 0.42, r: 0.085, pontos: 120, rotulo: 'Mural ferroviário' },
          { id: 'casario-leste', x: 0.84, y: 0.35, r: 0.085, pontos: 110, rotulo: 'Casario da avenida' },
          { id: 'estrela-xerife', x: 0.54, y: 0.415, r: 0.095, pontos: 150, rotulo: 'Estrela de xerife' },
          { id: 'chapeu-arvore', x: 0.54, y: 0.575, r: 0.085, pontos: 120, rotulo: 'Chapéu country' },
          { id: 'palmeira-esquerda', x: 0.255, y: 0.69, r: 0.09, pontos: 110, rotulo: 'Palmeira oeste' },
          { id: 'palmeira-direita', x: 0.765, y: 0.65, r: 0.09, pontos: 110, rotulo: 'Palmeira leste' },
          { id: 'viola-arvore', x: 0.555, y: 0.70, r: 0.085, pontos: 130, rotulo: 'Viola caipira' },
          { id: 'ferradura-arvore', x: 0.54, y: 0.84, r: 0.09, pontos: 130, rotulo: 'Ferradura dourada' },
        ],
      },
      {
        id: 'praca',
        nome: 'Praça Umbelina Bueno',
        subtitulo: 'Praça e Igreja',
        backdrop: 'assets/fases/fase-2.webp',
        alvos: [
          { id: 'palmeira-oeste-alta', x: 0.15, y: 0.25, r: 0.085, pontos: 110, rotulo: 'Palmeira oeste' },
          { id: 'lampiao-oeste', x: 0.17, y: 0.46, r: 0.09, pontos: 130, rotulo: 'Lampião oeste' },
          { id: 'alameda-palmeiras', x: 0.34, y: 0.52, r: 0.085, pontos: 110, rotulo: 'Alameda iluminada' },
          { id: 'torre-igreja', x: 0.51, y: 0.41, r: 0.095, pontos: 150, rotulo: 'Torre da igreja' },
          { id: 'coreto', x: 0.61, y: 0.60, r: 0.10, pontos: 140, rotulo: 'Coreto da praça' },
          { id: 'caminho-jardim', x: 0.40, y: 0.68, r: 0.085, pontos: 100, rotulo: 'Passeio da praça' },
          { id: 'jardim-leste', x: 0.825, y: 0.62, r: 0.08, pontos: 110, rotulo: 'Jardim leste' },
          { id: 'palmeira-leste-alta', x: 0.85, y: 0.34, r: 0.085, pontos: 110, rotulo: 'Palmeira leste' },
          { id: 'lampiao-leste', x: 0.86, y: 0.49, r: 0.085, pontos: 130, rotulo: 'Lampião leste' },
        ],
      },
      {
        id: 'centro',
        nome: 'Centro',
        subtitulo: 'Postes dourados country',
        backdrop: 'assets/fases/fase-3.webp',
        alvos: [
          { id: 'beiral-fachada', x: 0.18, y: 0.30, r: 0.085, pontos: 100, rotulo: 'Beiral iluminado' },
          { id: 'poste-oeste', x: 0.16, y: 0.47, r: 0.09, pontos: 130, rotulo: 'Poste oeste' },
          { id: 'vitrines-centro', x: 0.27, y: 0.57, r: 0.09, pontos: 110, rotulo: 'Vitrines do centro' },
          { id: 'varanda-centro', x: 0.39, y: 0.47, r: 0.085, pontos: 110, rotulo: 'Cordão de luzes' },
          { id: 'poste-central', x: 0.55, y: 0.55, r: 0.085, pontos: 120, rotulo: 'Poste da esquina' },
          { id: 'poste-fundo', x: 0.71, y: 0.59, r: 0.08, pontos: 110, rotulo: 'Fileira de postes' },
          { id: 'chapeu-poste', x: 0.82, y: 0.245, r: 0.095, pontos: 150, rotulo: 'Chapéu country' },
          { id: 'estrela-poste', x: 0.825, y: 0.445, r: 0.09, pontos: 140, rotulo: 'Estrela de xerife' },
          { id: 'pedestal-poste', x: 0.825, y: 0.755, r: 0.09, pontos: 130, rotulo: 'Base do poste' },
        ],
      },
    ],
  };

  global.CONFIG = CONFIG;
})(window);
