const SETTINGS = {

    // ── Guia da planilha a processar ──────────────────────────────────────────
    guiaAnalise: 'dados',

    // ── Comportamento ─────────────────────────────────────────────────────────

    // false = tabelas de 2ª pegada (DP) não recebem tempo de preparo
    preparo2aPegadaDP: false,

    // Gera linha de encerramento com atividade troca_turno
    geraEntradaTrocaTurno: true,

    // Gera linha de recolhe ao final da última tabela do carro
    geraEntradaRecolhidas: true,

    // Aplica formatação de campo (padding/alinhamento) também no CSV
    aplicarFormatacaoNoCsv: true,

    // ── Primeiro código sequencial de viagem 
    primeiroCodViagem: 10,

    // ── Mapa de turnos: horário de corte → número do turno ────────────────────
    // Lógica: se o início da tabela for < que a chave (em minutos), usa aquele turno.
    // As chaves são avaliadas em ordem crescente; o primeiro corte que o início
    // da tabela não ultrapassa define o turno. Se ultrapassar todos, usa o último.
    //
    // Exemplo:
    //   "12:00" → turno 1  (tabelas que iniciam antes das 12:00)
    //   "18:00" → turno 2  (tabelas que iniciam entre 12:00 e 17:59)
    //   "22:00" → turno 3  (tabelas que iniciam entre 18:00 e 21:59)
    //   qualquer coisa além → turno 4
    //
    // Pode-se usar quantos cortes forem necessários (mínimo 1).
    mapaTurnos: {
        '12:00': 1,
        '18:00': 2,
        '22:00': 3,
        '99:00': 4,   // sentinela — captura qualquer horário restante
    },

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
    sequenciaPosIntervalo: ['C', 'V', 'X', 'Z'],

    // ── Células de configuração na planilha ───────────
    cells: {
        codProg:         'F2',
        codLinha:        'F3',
        codIda:          'F4',
        codVolta:        'F5',
        tempoPreparo:    'F6',
        tempoAcesso:     'F7',
        tempoRecolhe:    'F8',
        codLocalPegada:  'F9',
    },

    // ── Configuração da grade de viagens ──────────────────────────────────────
    viagensConf: {
        // Intervalo principal de viagens (duas colunas por carro: IDA + VOLTA)
        intervaloGeral:        'I4:AV28',

        // Intervalo de exceções de VIAGENS (colunas A-G):
        //   A=carro  B=viagem  C=sentido  D=tipo  (critérios)
        //   E=atividade  F=local  G=linha         (overrides de viagem)
        intervaloExcecoesViagens: 'A35:G55',

        // Intervalo de exceções de TABELAS (colunas L-T):
        //   L=tabela (filtro)
        //   M=nome  N=inicio  O=fim  P=periodo
        //   Q=saida_garagem  R=preparo  S=acesso  T=recolhe
        intervaloExcecoesTabelas: 'L35:T55',

        // Número da linha (1-based) que contém o ID sequencial do carro
        linhaCarroID:    1,
        // Número da linha que contém o sentido (I/V) — usado como referência
        linhaSentido:    2,
        // Número da linha com código local de pegada personalizado por carro
        linhaLocalidade: 3,

        // Linhas de troca de turno (máximo 3 cortes por carro)
        linhasTrocaTurno: [29, 30, 31],
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
    //   firstSeq, codLocalPegada
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
