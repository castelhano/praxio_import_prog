const Engine = {
    // ... (parseCoord, toMin, minToTime, getCell permanecem iguais)
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
        let totalMins = Math.max(0, Math.round(m));
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
            acesMins: Engine.toMin(Engine.getCell(data, SETTINGS.cells.tempoAcesso)) || 0,
            recoMins: Engine.toMin(Engine.getCell(data, SETTINGS.cells.tempoRecolhe)) || 0,
            cutOffMin: Engine.toMin(Engine.getCell(data, SETTINGS.cells.horaCorteTurno)),
            firstSeq: parseInt(Engine.getCell(data, SETTINGS.cells.primeiroCodViagem) || 1),
            globalIda: Engine.getCell(data, SETTINGS.cells.codIda),
            globalVolta: Engine.getCell(data, SETTINGS.cells.codVolta)
        };

        const carregarOcioso = (intervaloStr) => {
            const dict = {};
            if (!intervaloStr) return dict;
            const coords = intervaloStr.split(':').map(Engine.parseCoord);
            for (let r = coords[0].row; r <= coords[1].row; r++) {
                const carro = String(data[r]?.[coords[0].col] || "").padStart(2, '0');
                const horaMin = Engine.toMin(data[r]?.[coords[0].col + 1]);
                const sentido = String(data[r]?.[coords[0].col + 2] || "").toUpperCase();
                if (carro !== "00" && horaMin !== null && sentido) {
                    // Chave única: Carro_Hora_Sentido
                    dict[`${carro}_${horaMin}_${sentido}`] = {
                        atividade: data[r]?.[coords[0].col + 3],
                        local: data[r]?.[coords[0].col + 4],
                        recolhe: Engine.toMin(data[r]?.[coords[0].col + 7])
                    };
                }
            }
            return dict;
        };

        const carregarExcecoesSimples = (intervaloStr) => {
            const dict = {};
            if (!intervaloStr) return dict;
            const coords = intervaloStr.split(':').map(Engine.parseCoord);
            for (let r = coords[0].row; r <= coords[1].row; r++) {
                const carro = String(data[r]?.[coords[0].col] || "").padStart(2, '0');
                const horaMin = Engine.toMin(data[r]?.[coords[0].col + 1]);
                const sentido = String(data[r]?.[coords[0].col + 2] || "").toUpperCase();
                if (carro !== "00" && horaMin !== null && sentido) {
                    dict[`${carro}_${horaMin}_${sentido}`] = data[r]?.[coords[0].col + 3];
                }
            }
            return dict;
        };

        const excecoes = {
            tipo: carregarExcecoesSimples(vConf.intervaloExcecoesTipo),
            local: carregarExcecoesSimples(vConf.intervaloExcecoesLocal),
            linha: carregarExcecoesSimples(vConf.intervaloExcecoesLinha),
            ocioso: carregarOcioso(vConf.intervaloExcecoesOcioso)
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
            
            // Trocas agora guardam o sentido baseado na coluna (Par=Ida, Ímpar=Volta)
            let trocas = vConf.linhasTrocaTurno
                .map(line => ({
                    min: Engine.toMin(data[line - 1]?.[c]),
                    sentido: (c % 2 === vS.col % 2) ? "I" : "V"
                }))
                .filter(t => t.min !== null).sort((a, b) => a.min - b.min);

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
                            overrideLocal: excecoes.local[key],
                            overrideLinha: excecoes.linha[key]
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
                
                while (trocas.length > 0 && trip.start >= trocas[0].min) {
                    const tabName = (tabIdx === 1 && duplaPegadaSet.has(carroID)) ? carroID + "C" : carroID + ["A", "B", "D", "E"][tabIdx];
                    // Passamos o objeto da troca que contém o sentido correto
                    allRows.push(...Engine.applyLayout(currentRows, trocas[0], false, globalCtx, tabStartMin, tabName, tabIdx === 0, carIdaDef, carVoltaDef, carroID, excecoes));
                    currentRows = []; 
                    tabStartMin = trip.start; 
                    trocas.shift(); 
                    tabIdx++; 
                    seq = globalCtx.firstSeq; 
                }

                currentRows.push({ ...trip, seq: seq++ });

                if (i === rawTrips.length - 1) {
                    const tabName = (tabIdx === 1 && duplaPegadaSet.has(carroID)) ? carroID + "C" : carroID + ["A", "B", "D", "E"][tabIdx];
                    // No recolhe, tabEndMin é um objeto fake para manter compatibilidade
                    allRows.push(...Engine.applyLayout(currentRows, { min: trip.end + globalCtx.recoMins, sentido: trip.dir }, true, globalCtx, tabStartMin, tabName, tabIdx === 0, carIdaDef, carVoltaDef, carroID, excecoes));
                }
            }
        }
        return allRows;
    },

    applyLayout: (trips, endObj, isLast, global, tabStartMin, tabName, isFirst, carIdaDef, carVoltaDef, carroID, excecoes) => {
        if (trips.length === 0) return [];
        let turn = String(tabName).endsWith("C") ? 3 : (tabStartMin >= global.cutOffMin ? 2 : 1);
        const lastIndex = trips.length - 1;
        const result = [];
        const garageStartValue = isFirst ? Engine.minToTime(tabStartMin - global.acesMins - global.prepMins) : "00:00";

        trips.forEach((t, idx) => {
            const isLastOfBlock = (idx === lastIndex);
            const tripCtx = {
                tab: tabName, turn: turn,
                tabStart: Engine.minToTime(tabStartMin - (isFirst ? global.acesMins : 0)),
                tabEnd: Engine.minToTime(endObj.min),
                garageStart: garageStartValue,
                direction: t.dir, // Sentido Real da Coluna
                seq: t.seq,
                departure: Engine.minToTime(t.start),
                arrival: Engine.minToTime(t.end),
                activity: t.overrideType || SETTINGS.atividades.produtiva,
                localCode: t.overrideLocal || (t.dir === "I" ? carIdaDef : carVoltaDef),
                codLinha: t.overrideLinha || global.codLinha
            };
            if (!(isLastOfBlock && isLast)) result.push(Engine.finalize(tripCtx, global));

            if (isLastOfBlock) {
                // Busca Ocioso: Carro + Hora + Sentido Real (Identificado pela coluna)
                const horaBusca = isLast ? t.start : endObj.min;
                const sentidoReal = isLast ? t.dir : endObj.sentido;
                const ocioso = excecoes.ocioso[`${carroID}_${horaBusca}_${sentidoReal}`] || {};

                const tempoRecolhe = (ocioso.recolhe !== undefined && ocioso.recolhe !== null) ? ocioso.recolhe : (isLast ? global.recoMins : 0);
                
                const extraCtx = {
                    tab: tabName, turn: turn,
                    tabStart: Engine.minToTime(tabStartMin - (isFirst ? global.acesMins : 0)),
                    tabEnd: Engine.minToTime(isLast ? t.end + tempoRecolhe : endObj.min),
                    garageStart: garageStartValue,
                    direction: sentidoReal, // Força o sentido da coluna/troca
                    seq: isLast ? t.seq : t.seq + 1,
                    departure: isLast ? Engine.minToTime(t.start) : Engine.minToTime(endObj.min),
                    arrival: isLast ? Engine.minToTime(t.end + tempoRecolhe) : Engine.minToTime(endObj.min),
                    activity: ocioso.activity || ocioso.atividade || (isLast ? SETTINGS.atividades.recolhe : SETTINGS.atividades.troca_turno),
                    localCode: ocioso.local || (isLast ? "11" : SETTINGS.atividades.troca_turno),
                    codLinha: global.codLinha
                };
                result.push(Engine.finalize(extraCtx, global));
            }
        });
        return result;
    },

    finalize: (tripCtx, global) => {
        const finalizedRow = {};
        SETTINGS.layout.forEach(conf => {
            if (conf.field === "COD_LINHA" && tripCtx.codLinha) {
                finalizedRow[conf.field] = String(tripCtx.codLinha).padStart(conf.size, conf.pad || "0");
                return;
            }
            finalizedRow[conf.field] = (typeof conf.resolve === 'function') 
                ? conf.resolve({ trip: tripCtx, global: global, helpers: Engine }) 
                : (tripCtx[conf.field] || "");
        });
        return finalizedRow;
    }
};