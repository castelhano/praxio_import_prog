const SETTINGS = {
    guiaAnalise: 'dados',
    atividades: { produtiva: "01", troca_turno: "10", recolhe: "11" },
    cells: {
        codProg: "B2",
        codLinha: "B3",
        codIda: "B4",
        codVolta: "B5",
        tempoPreparo: "B6",
        tempoRecolhe: "B7",
        horaCorteTurno: "B8",
        primeiroCodViagem: "B9"
    },
    viagensConf: {
        intervaloGeral: "H4:AU28",
        intervaloDuplaPegada: "B17:B35",
        linhaCarroID: 1,
        linhaSentido: 2,
        linhaLocalidade: 3,
        linhasTrocaTurno: [29, 30, 31],
        intervaloExcecoesTipo: "C3:F15",
        intervaloExcecoesLocal: "C18:F35",
        ignoreKeywords: ["RECO", "INTERV"]
    },
    layout: [
        { field: "COD_PROG", size: 7, pad: " ", align: "L", resolve: (ctx) => ctx.global.codProg },
        { field: "TAB",      size: 3, pad: " ", align: "L", resolve: (ctx) => ctx.trip.tab },
        { field: "TURN",     size: 1, pad: " ", align: "L", resolve: (ctx) => ctx.trip.turn },
        { field: "INICIO",   size: 5, pad: " ", align: "L", type: "hour", resolve: (ctx) => ctx.trip.tabStart },
        { field: "TERM",     size: 5, pad: " ", align: "L", type: "hour", resolve: (ctx) => ctx.trip.tabEnd },
        { field: "INIC_GAR", size: 5, pad: " ", align: "L", type: "hour", resolve: (ctx) => ctx.trip.garageStart },
        { field: "SENTIDO",  size: 1, pad: " ", align: "L", resolve: (ctx) => ctx.trip.direction },
        { field: "COD",      size: 2, pad: "0", align: "R", resolve: (ctx) => ctx.trip.seq },
        { field: "SAIDA",    size: 5, pad: " ", align: "L", type: "hour", resolve: (ctx) => ctx.trip.departure },
        { field: "CHEGADA",  size: 5, pad: " ", align: "L", type: "hour", resolve: (ctx) => ctx.trip.arrival },
        { field: "ATIV",     size: 2, pad: "0", align: "R", resolve: (ctx) => ctx.trip.activity },
        { field: "COD_LOCAL",size: 3, pad: "0", align: "R", resolve: (ctx) => ctx.trip.localCode },
        { field: "COD_LINHA",size: 3, pad: "0", align: "R", resolve: (ctx) => ctx.global.codLinha }
    ]
};