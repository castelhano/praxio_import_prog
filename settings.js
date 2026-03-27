const SETTINGS = {

    // ── Guia da planilha a processar ──────────────────────────────────────────
    guiaAnalise: 'dados',

    // ── Comportamento ─────────────────────────────────────────────────────────

    // false = tabelas de 2ª pegada (DP) não recebem tempo de preparo
    preparo2aPegadaDP: false,

    // Gera linha de encerramento com atividade troca_turno / intervalo
    geraEntradaIntervalos: true,

    // Gera linha de recolhe ao final da última tabela do carro
    geraEntradaRecolhidas: true,

    // Aplica formatação de campo (padding/alinhamento) também no CSV
    aplicarFormatacaoNoCsv: true,

    // ── Códigos de atividade ──────────────────────────────────────────────────
    atividades: {
        produtiva:   '01',
        intervalo:   '07',
        troca_turno: '10',
        recolhe:     '11',
    },

    // ── Sequências de letras para nomeação de tabelas ─────────────────────────
    // Primeira tabela e retornos de TT
    sequenciaNormal: ['A', 'B', 'D', 'E', 'F'],
    // Retornos de intervalo (2ª pegada ou pausa)
    sequenciaPosIntervalo: ['C', 'G', 'H', 'I'],

    // ── Células de configuração na planilha (coluna C, linhas 2-11) ───────────
    cells: {
        codProg:         'C2',
        codLinha:        'C3',
        codIda:          'C4',
        codVolta:        'C5',
        tempoPreparo:    'C6',
        tempoAcesso:     'C7',
        tempoRecolhe:    'C8',
        horaCorteTurno:  'C9',
        primeiroCodViagem: 'C10',
        codLocalPegada:  'C11',
    },

    // ── Configuração da grade de viagens ──────────────────────────────────────
    viagensConf: {
        // Intervalo principal de viagens (duas colunas por carro: IDA + VOLTA)
        intervaloGeral:        'I4:AV28',

        // Coluna com identificação de dupla pegada (ex: "01A", "02C")
        intervaloDuplaPegada:  'G2:G28',

        // Intervalo de exceções (colunas: A-D critérios, E-J overrides)
        intervaloExcecoes:     'A35:J55',

        // Número da linha (1-based) que contém o ID sequencial do carro
        linhaCarroID:    1,
        // Número da linha que contém o sentido (I/V) — usado como referência
        linhaSentido:    2,
        // Número da linha com código local de pegada personalizado por carro
        linhaLocalidade: 3,

        // Linhas de troca de turno (máximo 3 cortes por carro)
        linhasTrocaTurno: [29, 30, 31],

        // Textos a ignorar nas células de viagem (qualquer correspondência parcial)
        ignoreKeywords: ['RECO', 'INTERV'],
    },

    // ── Layout de saída ───────────────────────────────────────────────────────
    //
    // Cada entrada define um campo do arquivo de exportação:
    //   field:   nome do campo (usado como header no CSV)
    //   size:    largura fixa em caracteres
    //   pad:     caractere de preenchimento (' ' ou '0')
    //   align:   'L' = pad à direita (left-align) | 'R' = pad à esquerda (right-align)
    //   type:    'hour' = truncar para HH:MM (opcional)
    //   resolve: função (ctx) => valor — ctx = { trip, global }
    //
    // ctx.trip campos disponíveis:
    //   tab, turn, tabStart, tabEnd, garageStart, pegada, preparo,
    //   direction, seq, departure, arrival, activity, localCode,
    //   codLinha, isExcecaoLinha
    //
    // ctx.global campos disponíveis:
    //   codProg, codLinha, codIda, codVolta, prepMins, acesMins, recoMins,
    //   cutOffMin, firstSeq, codLocalPegada
    //
    layout: [
        { field: 'COD_PROG',   size: 7,  pad: ' ', align: 'L',           resolve: (ctx) => ctx.global.codProg       },
        { field: 'TAB',        size: 3,  pad: ' ', align: 'L',           resolve: (ctx) => ctx.trip.tab             },
        { field: 'TURN',       size: 1,  pad: ' ', align: 'L',           resolve: (ctx) => ctx.trip.turn            },
        { field: 'INICIO',     size: 5,  pad: ' ', align: 'L', type: 'hour', resolve: (ctx) => ctx.trip.tabStart    },
        { field: 'TERM',       size: 5,  pad: ' ', align: 'L', type: 'hour', resolve: (ctx) => ctx.trip.tabEnd      },
        { field: 'COD_PEGADA', size: 5,  pad: '0', align: 'R',           resolve: (ctx) => ctx.trip.pegada          },
        { field: 'PREPARO',    size: 2,  pad: '0', align: 'R',           resolve: (ctx) => ctx.trip.preparo         },
        { field: 'INIC_GAR',   size: 5,  pad: ' ', align: 'L', type: 'hour', resolve: (ctx) => ctx.trip.garageStart },
        { field: 'SENTIDO',    size: 1,  pad: ' ', align: 'L',           resolve: (ctx) => ctx.trip.direction       },
        { field: 'COD',        size: 2,  pad: '0', align: 'R',           resolve: (ctx) => ctx.trip.seq             },
        { field: 'SAIDA',      size: 5,  pad: ' ', align: 'L', type: 'hour', resolve: (ctx) => ctx.trip.departure   },
        { field: 'CHEGADA',    size: 5,  pad: ' ', align: 'L', type: 'hour', resolve: (ctx) => ctx.trip.arrival     },
        { field: 'ATIV',       size: 2,  pad: '0', align: 'R',           resolve: (ctx) => ctx.trip.activity        },
        { field: 'COD_LOCAL',  size: 5,  pad: '0', align: 'R',           resolve: (ctx) => ctx.trip.localCode       },
        { field: 'COD_LINHA',  size: 3,  pad: ' ', align: 'R',           resolve: (ctx) => ctx.trip.isExcecaoLinha ? ctx.trip.codLinha : '' },
    ],
};
