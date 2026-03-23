const SETTINGS = {
    atividades: { produtiva: "01", troca_turno: "10", recolhe: "11" },
    cells: {
        codProg: "B4",
        codLinha: "B5",
        codIda: "B6",
        codVolta: "B7",
        tempoPreparo: "B8",
        tempoRecolhe: "B9",
        horaCorteTurno: "B10",
        primeiroCodViagem: "B11"
    },
    // Alinhamento: "L" (Esquerda/Fim) ou "R" (Direita/Início)
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