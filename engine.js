const Engine = {
    toMin: (val) => {
        if (val === undefined || val === null || val === '') return null;
        if (typeof val === 'number') return Math.round(val * 24 * 60);
        if (typeof val === 'string') {
            const s = val.trim().toUpperCase();
            if (s.includes('RECO') || s.includes('INTER') || !s.includes(':')) return null;
            const [h, m] = s.split(':').map(Number);
            return (h * 60) + m;
        }
        return null;
    },

    minToTime: (m) => {
        if (m === null || isNaN(m)) return "00:00";
        return `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
    },

    getCell: (matrix, coord) => {
        const col = coord.charCodeAt(0) - 65;
        const row = parseInt(coord.substring(1)) - 1;
        return matrix[row] ? matrix[row][col] : null;
    },

    process: (workbook) => {
        const sheet = workbook.Sheets["oso"];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

        // 1. Contexto Global (Parâmetros fixos)
        const globalCtx = {
            codProg: Engine.getCell(data, SETTINGS.cells.codProg),
            codLinha: Engine.getCell(data, SETTINGS.cells.codLinha),
            prepMins: Engine.toMin(Engine.getCell(data, SETTINGS.cells.tempoPreparo)) || 0,
            recoMins: Engine.toMin(Engine.getCell(data, SETTINGS.cells.tempoRecolhe)) || 0,
            cutOffMin: Engine.toMin(Engine.getCell(data, SETTINGS.cells.horaCorteTurno)),
            firstSeq: parseInt(Engine.getCell(data, SETTINGS.cells.primeiroCodViagem) || 1),
            globalIda: Engine.getCell(data, SETTINGS.cells.codIda),
            globalVolta: Engine.getCell(data, SETTINGS.cells.codVolta)
        };

        const duplaPegadaSet = new Set();
        for(let i=13; i<=27; i++) if(data[i] && data[i][1]) duplaPegadaSet.add(String(data[i][1]).trim());

        let allRows = [];

        // 2. Extração por Carro
        for (let c = 2; c <= 21; c += 2) {
            let carroID = data[0] && data[0][c] ? String(data[0][c]).padStart(2, '0') : null;
            if (!carroID || carroID === "00") continue;

            const carIda = data[2][c] || globalCtx.globalIda;
            const carVolta = data[2][c+1] || globalCtx.globalVolta;
            let trocas = [data[28][c], data[29][c], data[30][c], data[28][c+1], data[29][c+1], data[30][c+1]]
                         .map(t => Engine.toMin(t)).filter(t => t !== null).sort((a,b) => a-b);

            let rawTrips = [];
            for (let r = 3; r <= 27; r++) {
                let mI = Engine.toMin(data[r][c]), mV = Engine.toMin(data[r][c+1]);
                if (mI === null && mV === null) {
                    if (String(data[r][c] || "").toUpperCase().includes("RECO")) break;
                    continue;
                }
                if (mI !== null) rawTrips.push({ dir: "I", start: mI, end: mV || Engine.toMin(data[r+1]?.[c+1]) || mI });
                if (mV !== null) rawTrips.push({ dir: "V", start: mV, end: Engine.toMin(data[r+1]?.[c]) || mV });
            }
            if (!rawTrips.length) continue;
            rawTrips.sort((a,b) => a.start - b.start);

            // 3. Transformação usando o Layout Resolvers
            let tabIdx = 0, seq = globalCtx.firstSeq, currentRows = [];
            let currentLetter = ["A", "B", "D", "E"];
            let tabStartMin = rawTrips[0].start;

            const getTabName = (idx) => {
                let letter = currentLetter[idx] || "Z";
                return (letter === "B" && duplaPegadaSet.has(carroID + "C")) ? carroID + "C" : carroID + letter;
            };

            for (let i = 0; i < rawTrips.length; i++) {
                let trip = rawTrips[i];

                // Lógica de Troca de Turno
                while (trocas.length > 0 && trip.start >= trocas[0]) {
                    allRows.push(...Engine.applyLayout(currentRows, trocas[0], false, globalCtx, tabStartMin, getTabName(tabIdx), tabIdx === 0, carIda, carVolta));
                    currentRows = []; trocas.shift(); tabIdx++; seq = globalCtx.firstSeq; tabStartMin = trip.start;
                }

                currentRows.push({ ...trip, seq: seq++ });

                if (i === rawTrips.length - 1) {
                    allRows.push(...Engine.applyLayout(currentRows, trip.end + globalCtx.recoMins, true, globalCtx, tabStartMin, getTabName(tabIdx), tabIdx === 0, carIda, carVolta));
                }
            }
        }
        return allRows;
    },

    // A "PONTE": Aplica as funções de resolve do settings.js
    applyLayout: (trips, tabEndMin, isLast, global, tabStartMin, tabName, isFirst, carIda, carVolta) => {
        const horaCorteMin = global.cutOffMin;
        
        // Define o turno da tabela (1, 2 ou 3 para dupla pegada)
        let turn = 1;
        if (String(tabName).endsWith("C")) {
            turn = 3;
        } else if (tabStartMin >= horaCorteMin) {
            turn = 2;
        }

        // Criamos uma cópia das viagens e adicionamos UMA linha extra (Troca ou Recolhe)
        const rowsToProcess = [...trips, { isExtra: true }];

        return rowsToProcess.map((t, idx) => {
            const isExtraRow = !!t.isExtra;
            const lastTrip = trips[trips.length - 1];

            // Montamos o contexto que o 'resolve' do settings.js vai ler
            const tripCtx = {
                tab: tabName,
                turn: turn,
                tabStart: Engine.minToTime(tabStartMin),
                tabEnd: Engine.minToTime(tabEndMin),
                garageStart: isFirst ? Engine.minToTime(tabStartMin - global.prepMins) : "00:00",
                
                // Se for a linha extra, repete os dados da última viagem mas muda atividade e horários
                direction: isExtraRow ? lastTrip.dir : t.dir,
                seq: isExtraRow ? (lastTrip.seq + 1) : t.seq,
                departure: isExtraRow ? (isLast ? Engine.minToTime(lastTrip.end) : Engine.minToTime(tabEndMin)) : Engine.minToTime(t.start),
                arrival: isExtraRow ? Engine.minToTime(tabEndMin) : Engine.minToTime(t.end),
                
                activity: isExtraRow 
                    ? (isLast ? SETTINGS.atividades.recolhe : SETTINGS.atividades.troca_turno) 
                    : SETTINGS.atividades.produtiva,
                
                localCode: (isExtraRow && isLast) ? "11" : ( (isExtraRow ? lastTrip.dir : t.dir) === "I" ? carIda : carVolta)
            };

            // Aplica os Resolvers do Layout
            const finalizedRow = {};
            SETTINGS.layout.forEach(conf => {
                if (typeof conf.resolve === 'function') {
                    finalizedRow[conf.field] = conf.resolve({ 
                        trip: tripCtx, 
                        global: global, 
                        helpers: Engine 
                    });
                } else {
                    finalizedRow[conf.field] = tripCtx[conf.field] || "";
                }
            });

            return finalizedRow;
        });
    }
};