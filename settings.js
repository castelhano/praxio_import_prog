const SETTINGS = {

    camposDisponiveis: [
        'COD_PROGRAMAÇÃO',
        'SERVICO_TAB',
        'TURNO',
        'INICIO_SERVICO',
        'FIM_SERVICO',
        'COD_LOCAL_MOT',
        'COD_LOCAL_COB',
        'PREPARO_MOT',
        'PREPARO_COB',
        'RETORNO_GAR',
        'ENTREGA_FERIAS',
        'SAIDA_GAR',
        'SENTIDO',
        'COD_VIAGENS',
        'HORARIO_SAIDA',
        'HORARIO_CHEGADA',
        'COD_ATIVIDADE',
        'COD_LOCALIDADE',
        'COD_LINHA',
        'DURACAO_ATIVIDADE',
        'SUFIXO',
        'TIPO_HORARIO',
        'DUPLA_PEGADA',
        'IDENTIFICADOR',
        'SERV_RENDICAO'
    ],

    // ── Guia da planilha a processar ──────────────────────────────────────────
    guiaAnalise: 'dados',

    // ── Comportamento ─────────────────────────────────────────────────────────

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
    // Só tem efeito quando ehCircular=[true, 1, sim] na célula cells.ehCircular da planilha.
    //
    // circularMeiaViagemConsisteSentido:
    //   true  = usa sentido I (ida) ou V (volta) dependendo da coluna da viagem
    //   false = usa C (circular) para todas as viagens, inclusive meias viagens
    circularGeraMeiaViagem:              true,
    circularMeiaViagemConsisteSentido:   true,

    // ── Mapa de turnos: horário de corte → número do turno ────────────────────
    mapaTurnos: {
        '09:00': 1,
        '19:00': 2,
        '99:00': 4, // sentinela — captura qualquer horário restante 
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
        ehCircular:      'F10',  // true, 1 ou sim = linha circular; qualquer outro valor = comportamento padrão
        layoutColunas:   'F11',  // código do layout de colunas da grade de viagens (padrão: '1')
    },

    // ── Layouts de colunas da grade de viagens ────────────────────────────────
    //
    // Cada layout define quantas colunas ocupa um carro (totalColunas) e quais
    // papéis cada coluna relativa (0-based dentro do bloco) desempenha.
    //
    // Papéis disponíveis:
    //   ida_inicio   — obrigatório — horário de saída da viagem de ida
    //   ida_fim      — opcional   — fim explícito da ida;
    //                               se ausente, usa volta_inicio da mesma linha
    //   volta_inicio — obrigatório — horário de saída da viagem de volta
    //   volta_fim    — opcional   — fim explícito da volta;
    //                               se ausente, usa ida_inicio da linha seguinte
    //
    // Colunas sem papel definido são simplesmente ignoradas pelo engine.
    // O código lido de F11 deve corresponder a uma chave deste mapa;
    // se ausente ou não encontrado, o engine usa o layout '1'.
    //
    layoutColunas: {

        // Layout 1 — padrão atual: 2 colunas IDA / VOLTA
        // IDA:   start = ida_inicio[r],   end = volta_inicio[r]   (ida_fim ausente)
        // VOLTA: start = volta_inicio[r], end = ida_inicio[r+1]   (volta_fim ausente)
        '1': {
            totalColunas: 2,
            slots: {
                ida_inicio:   0,
                volta_inicio: 1,
            },
        },

        // Layout 2 — 3 colunas IDA / VOLTA / FIM_VOLTA
        // IDA:   start = ida_inicio[r],   end = volta_inicio[r]   (ida_fim ausente)
        // VOLTA: start = volta_inicio[r], end = volta_fim[r]      (explícito)
        '2': {
            totalColunas: 3,
            slots: {
                ida_inicio:   0,
                volta_inicio: 1,
                volta_fim:    2,
            },
        },

        // Layout 3 — 4 colunas onde apenas colunas 0 e 2 importam (1 e 3 ignoradas)
        // IDA:   start = ida_inicio[r],   end = volta_inicio[r]   (ida_fim ausente)
        // VOLTA: start = volta_inicio[r], end = ida_inicio[r+1]   (volta_fim ausente)
        '3': {
            totalColunas: 4,
            slots: {
                ida_inicio:   0,
                volta_inicio: 2,
            },
        },

        // Layout 4 — 4 colunas com fim explícito para ambos os sentidos
        // IDA:   start = ida_inicio[r],   end = ida_fim[r]        (explícito)
        // VOLTA: start = volta_inicio[r], end = volta_fim[r]      (explícito)
        '4': {
            totalColunas: 4,
            slots: {
                ida_inicio:   0,
                ida_fim:      1,
                volta_inicio: 2,
                volta_fim:    3,
            },
        },
    },

    // ── Configuração da grade de viagens ──────────────────────────────────────
    viagensConf: {
        intervaloGeral:           'I4:AV33',
        intervaloExcecoesViagens: 'A40:G60',
        intervaloExcecoesTabelas: 'L40:T60',

        linhaCarroID:    1,
        linhaSentido:    2,
        linhaLocalidade: 3,

        linhasTrocaTurno: [34, 35, 36],
    },

    // ── Layout de saída ───────────────────────────────────────────────────────
    layout: [
        { field: 'COD_PROGRAMAÇÃO', size: 8,  pad: ' ', align: 'L',           resolve: (ctx) => ctx.global.codProg       },
        { field: 'SERVICO_TAB',     size: 5,  pad: ' ', align: 'L',           resolve: (ctx) => ctx.trip.tab             },
        { field: 'TURNO',           size: 1,  pad: ' ', align: 'L',           resolve: (ctx) => ctx.trip.turn            },
        { field: 'INICIO_SERVICO',  size: 5,  pad: ' ', align: 'L', type: 'hour', resolve: (ctx) => ctx.trip.tabStart    },
        { field: 'FIM_SERVICO',     size: 5,  pad: ' ', align: 'L', type: 'hour', resolve: (ctx) => ctx.trip.tabEnd      },
        { field: 'COD_LOCAL_MOT',   size: 6,  pad: '0', align: 'R',           resolve: (ctx) => ctx.trip.pegada          },
        { field: 'PREPARO_MOT',     size: 2,  pad: '0', align: 'R',           resolve: (ctx) => ctx.trip.preparo         },
        { field: 'SAIDA_GAR',       size: 5,  pad: ' ', align: 'L', type: 'hour', resolve: (ctx) => ctx.trip.garageStart },
        { field: 'SENTIDO',         size: 1,  pad: ' ', align: 'L',           resolve: (ctx) => ctx.trip.direction       },
        { field: 'COD_VIAGENS',     size: 2,  pad: '0', align: 'R',           resolve: (ctx) => ctx.trip.seq             },
        { field: 'HORARIO_SAIDA',   size: 5,  pad: ' ', align: 'L', type: 'hour', resolve: (ctx) => ctx.trip.departure   },
        { field: 'HORARIO_CHEGADA', size: 5,  pad: ' ', align: 'L', type: 'hour', resolve: (ctx) => ctx.trip.arrival     },
        { field: 'COD_ATIVIDADE',   size: 2,  pad: '0', align: 'R',           resolve: (ctx) => ctx.trip.activity        },
        { field: 'COD_LOCALIDADE',  size: 5,  pad: '0', align: 'R',           resolve: (ctx) => ctx.trip.localCode       },
        { field: 'COD_LINHA',       size: 3,  pad: ' ', align: 'R',           resolve: (ctx) => ctx.trip.isExcecaoLinha ? ctx.trip.codLinha : '' },
    ],
};