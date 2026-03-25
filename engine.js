const Engine = {
    parseCoord: (coord) => {
        if (!coord) return null;
        const parts = coord.match(/([A-Z]+)(\d+)/);
        if (!parts) return null;
        const colStr = parts[1], rowStr = parts[2];
        let col = 0;
        for (let i = 0; i < colStr.length; i++) col = col * 26 + (colStr.charCodeAt(i) - 64);
        return { row: parseInt(rowStr) - 1, col: col - 1 };
    },

    toMin: (val) => {
        if (val === undefined || val === null || val === '') return null;
        if (typeof val === 'number') return Math.round(val * 24 * 60);
        if (typeof val === 'string') {
            const s = val.trim().toUpperCase();
            if (SETTINGS.viagensConf.ignoreKeywords.some(k => s.includes(k)) || !s.includes(':')) return null;
            const [h, m] = s.split(':').map(Number);
            return (h * 60) + m;
        }
        return null;
    },

    minToTime: (m) => {
        if (m === null || isNaN(m)) return "00:00";
        let totalMins = Math.round(m);
        const h = Math.floor(totalMins / 60);
        const min = totalMins % 60;
        return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    },

    getCell: (matrix, coord) => {
        const pos = Engine.parseCoord(coord);
        if (!pos) return null;
        return matrix[pos.row] ? matrix[pos.row][pos.col] : null;
    },

    process: (workbook) => {
        const sheet = workbook.Sheets[SETTINGS.guiaAnalise];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
        const vConf = SETTINGS.viagensConf;

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

        // Carrega exceções apenas para viagens PRODUTIVAS
        const carregarExcecoes = (intervaloStr) => {
            const dict = {};
            if (!intervaloStr) return dict;
            const coords = intervaloStr.split(':').map(Engine.parseCoord);
            for (let r = coords[0].row; r <= coords[1].row; r++) {
                const carro = data[r]?.[coords[0].col];
                const horaMin = Engine.toMin(data[r]?.[coords[0].col + 1]);
                const sentido = String(data[r]?.[coords[0].col + 2] || "").toUpperCase();
                const valor = data[r]?.[coords[0].col + 3];
                if (carro && horaMin !== null && sentido) {
                    dict[`${String(carro).padStart(2, '0')}_${horaMin}_${sentido}`] = String(valor).trim();
                }
            }
            return dict;
        };

        const excecoes = {
            tipo: carregarExcecoes(vConf.intervaloExcecoesTipo),
            local: carregarExcecoes(vConf.intervaloExcecoesLocal)
        };

        const [dpS, dpE] = vConf.intervaloDuplaPegada.split(':').map(Engine.parseCoord);
        const duplaPegadaSet = new Set();
        for (let r = dpS.row; r <= dpE.row; r++) {
            let val = data[r]?.[dpS.col];
            if (val) duplaPegadaSet.add(String(val).trim());
        }

        const [vS, vE] = vConf.intervaloGeral.split(':').map(Engine.parseCoord);
        let allRows = [];

        for (let c = vS.col; c <= vE.col; c += 2) {
            let carroIDRaw = data[vConf.linhaCarroID - 1]?.[c];
            if (!carroIDRaw || carroIDRaw === "00" || carroIDRaw === 0) continue;

            const carroID = String(carroIDRaw).padStart(2, '0');
            const carIdaDef = data[vConf.linhaLocalidade - 1]?.[c] || globalCtx.globalIda;
            const carVoltaDef = data[vConf.linhaLocalidade - 1]?.[c + 1] || globalCtx.globalVolta;
            
            let trocas = vConf.linhasTrocaTurno
                .map(line => Engine.toMin(data[line - 1]?.[c]))
                .filter(t => t !== null).sort((a, b) => a - b);

            let rawTrips = [];
            for (let r = vS.row; r <= vE.row; r++) {
                [{ v: data[r]?.[c], d: "I" }, { v: data[r]?.[c+1], d: "V" }].forEach(item => {
                    let m = Engine.toMin(item.v);
                    if (m !== null) {
                        const key = `${carroID}_${m}_${item.d}`;
                        let end = (item.d === "I") 
                            ? (Engine.toMin(data[r]?.[c+1]) || Engine.toMin(data[r+1]?.[c+1]) || m)
                            : (Engine.toMin(data[r+1]?.[c]) || m);

                        rawTrips.push({ 
                            dir: item.d, start: m, end: end,
                            overrideType: excecoes.tipo[key],
                            overrideLocal: excecoes.local[key]
                        });
                    }
                });
            }

            if (rawTrips.length === 0) continue;
            rawTrips.sort((a, b) => a.start - b.start);

            let tabIdx = 0, seq = globalCtx.firstSeq, currentRows = [];
            let tabStartMin = rawTrips[0].start;

            for (let i = 0; i < rawTrips.length; i++) {
                let trip = rawTrips[i];
                
                while (trocas.length > 0 && trip.start >= trocas[0]) {
                    const tabName = (tabIdx === 1 && duplaPegadaSet.has(carroID)) ? carroID + "C" : carroID + ["A", "B", "D", "E"][tabIdx];
                    allRows.push(...Engine.applyLayout(currentRows, trocas[0], false, globalCtx, tabStartMin, tabName, tabIdx === 0, carIdaDef, carVoltaDef, carroID));
                    currentRows = []; 
                    tabStartMin = trip.start; 
                    trocas.shift(); 
                    tabIdx++; 
                    seq = globalCtx.firstSeq; 
                }

                currentRows.push({ ...trip, seq: seq++ });

                if (i === rawTrips.length - 1) {
                    const tabName = (tabIdx === 1 && duplaPegadaSet.has(carroID)) ? carroID + "C" : carroID + ["A", "B", "D", "E"][tabIdx];
                    allRows.push(...Engine.applyLayout(currentRows, trip.end + globalCtx.recoMins, true, globalCtx, tabStartMin, tabName, tabIdx === 0, carIdaDef, carVoltaDef, carroID));
                }
            }
        }
        return allRows;
    },

    applyLayout: (trips, tabEndMin, isLast, global, tabStartMin, tabName, isFirst, carIdaDef, carVoltaDef, carroID) => {
        if (trips.length === 0) return [];

        let turn = String(tabName).endsWith("C") ? 3 : (tabStartMin >= global.cutOffMin ? 2 : 1);
        const lastIndex = trips.length - 1;
        const result = [];

        trips.forEach((t, idx) => {
            const isLastOfBlock = (idx === lastIndex);

            // Se for RECOLHIDA (isLast === true), a última viagem produtiva é convertida em 11
            if (isLastOfBlock && isLast) {
                const tripCtx = {
                    tab: tabName, turn: turn,
                    tabStart: Engine.minToTime(tabStartMin),
                    tabEnd: Engine.minToTime(tabEndMin),
                    garageStart: (isFirst && idx === 0) ? Engine.minToTime(tabStartMin - global.prepMins) : "00:00",
                    direction: t.dir, // Mantém o sentido exato do Excel (Ex: V das 23:20)
                    seq: t.seq,
                    departure: Engine.minToTime(t.start),
                    arrival: Engine.minToTime(tabEndMin),
                    activity: SETTINGS.atividades.recolhe,
                    localCode: "11"
                };
                result.push(Engine.finalize(tripCtx, global));
            } 
            // Casos normais e Troca de Turno
            else {
                const tripCtx = {
                    tab: tabName, turn: turn,
                    tabStart: Engine.minToTime(tabStartMin),
                    tabEnd: Engine.minToTime(tabEndMin),
                    garageStart: (isFirst && idx === 0) ? Engine.minToTime(tabStartMin - global.prepMins) : "00:00",
                    direction: t.dir,
                    seq: t.seq,
                    departure: Engine.minToTime(t.start),
                    arrival: Engine.minToTime(t.end),
                    activity: t.overrideType || SETTINGS.atividades.produtiva,
                    localCode: t.overrideLocal || (t.dir === "I" ? carIdaDef : carVoltaDef)
                };
                result.push(Engine.finalize(tripCtx, global));

                // Se for TROCA DE TURNO, insere a linha de 0 min após a produtiva
                if (isLastOfBlock && !isLast) {
                    const extraCtx = {
                        tab: tabName, turn: turn,
                        tabStart: Engine.minToTime(tabStartMin),
                        tabEnd: Engine.minToTime(tabEndMin),
                        garageStart: "00:00",
                        direction: t.dir, // Mantém o sentido da última produtiva
                        seq: t.seq + 1,
                        departure: Engine.minToTime(tabEndMin),
                        arrival: Engine.minToTime(tabEndMin),
                        activity: SETTINGS.atividades.troca_turno,
                        localCode: SETTINGS.atividades.troca_turno
                    };
                    result.push(Engine.finalize(extraCtx, global));
                }
            }
        });

        return result;
    },

    finalize: (tripCtx, global) => {
        const finalizedRow = {};
        SETTINGS.layout.forEach(conf => {
            finalizedRow[conf.field] = (typeof conf.resolve === 'function') 
                ? conf.resolve({ trip: tripCtx, global: global, helpers: Engine }) 
                : (tripCtx[conf.field] || "");
        });
        return finalizedRow;
    }
};