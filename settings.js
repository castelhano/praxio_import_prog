const SETTINGS = {

    // ── Guia da planilha a processar ──────────────────────────────────────────
    guiaAnalise: 'dados',

    // ── Comportamento ─────────────────────────────────────────────────────────

    // false = tabelas de 2ª pegada (DP) não recebem tempo de preparo
    preparo2aPegadaDP: false,

    // Gera linha de encerramento com atividade troca_turno
    geraEntradaTrocaTurno: true,
    
    // Gera linha de encerramento com atividade intervalo
    geraEntradaIntervalo: true,

    // Gera linha de recolhe ao final da última tabela do carro
    geraEntradaRecolhidas: true,

    // Aplica formatação de campo (padding/alinhamento) também no CSV
    aplicarFormatacaoNoCsv: true,
    

    // ── Primeiro código sequencial de viagem
    primeiroCodViagem: 10,

    // ── Configuração de linha circular ────────────────────────────────────────
    //
    // Gera meia viagem quando o carro inicia/termina no meio do percurso.
    // Só tem efeito quando ehCircular=true na célula cells.ehCircular da planilha.
    //
    // circularGeraMeiaViagem:
    //   true  = gera entrada de meia viagem (VOLTA ou término prematuro de IDA)
    //   false = ignora lançamentos na coluna VOLTA em linhas circulares
    //
    // circularCodSentidoMeiaViagemIda:
    //   Código de sentido para término prematuro (colIda e colVolta preenchidos).
    //   null = usa 'C' (mesmo código das viagens normais circulares)
    //
    // circularCodSentidoMeiaViagemVolta:
    //   Código de sentido para viagem iniciada na coluna VOLTA.
    //   null = usa 'C'
    //   Só gerada se for a primeira viagem do carro ou primeira após intervalo.
    circularGeraMeiaViagem:              true,
    circularMeiaViagemConsisteSentido:   true,

    // ── Mapa de turnos: horário de corte → número do turno ────────────────────
    mapaTurnos: {
        '12:00': 1,
        '18:00': 2,
        '22:00': 3,
        '99:00': 4,
    },

    // ── Códigos de atividade ──────────────────────────────────────────────────
    atividades: {
        produtiva:   { cod: '01', local: null },
        intervalo:   { cod: '07', local: '07' },
        troca_turno: { cod: '10', local: '10' },
        recolhe:     { cod: '11', local: '11' },
    },


    // ── Sequências de letras para nomeação de tabelas ─────────────────────────
    sequenciaNormal:       ['A', 'B', 'D', 'E', 'F'],
    sequenciaPosIntervalo: ['C', 'V', 'X', 'Z'],

    // ── Células de configuração na planilha ───────────────────────────────────
    cells: {
        codProg:         'F2',
        codLinha:        'F3',
        codIda:          'F4',
        codVolta:        'F5',
        tempoPreparo:    'F6',
        tempoAcesso:     'F7',
        tempoRecolhe:    'F8',
        codLocalPegada:  'F9',
        ehCircular:      'F10',  // true ou 1 = linha circular; vazio ou 0 = normal
    },

    // ── Configuração da grade de viagens ──────────────────────────────────────
    viagensConf: {
        intervaloGeral:           'I4:AV28',
        intervaloExcecoesViagens: 'A35:G55',
        intervaloExcecoesTabelas: 'L35:T55',

        linhaCarroID:    1,
        linhaSentido:    2,
        linhaLocalidade: 3,

        linhasTrocaTurno: [29, 30, 31],
    },

    // ── Layout de saída ───────────────────────────────────────────────────────
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
