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
        if (typeof val === 'number') return val >= 1 ? Math.round(val) : Math.round(val * 1440);
        const s = String(val).trim().toUpperCase();
        if (!s.includes(':')) return null;
        const [h, m] = s.split(':').map(Number);
        return (h * 60) + m;
    },

    minToTime: (min) => {
        if (min === null || min === undefined) return "";
        const h = Math.floor(min / 60).toString().padStart(2, '0');
        const m = (min % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    },

    // Filtro Dinâmico: Se o campo na exceção estiver vazio, ele ignora o critério (valida todos)
    getExcecao: (viagem, excecoes) => {
        return excecoes.find(exc => {
            const matchCarro = !exc.carro || String(exc.carro) === String(viagem.carro);
            const matchHora = !exc.viagem || Engine.toMin(exc.viagem) === viagem.start;
            const matchSentido = !exc.sentido || exc.sentido === viagem.direction;
            const matchTipo = !exc.tipo || exc.tipo === viagem.tipoInterno; // P ou O
            return matchCarro && matchHora && matchSentido && matchTipo;
        });
    },

    process: (sheetData) => {
        const range = Engine.parseCoord(SETTINGS.viagensConf.intervaloGeral.split(':')[0]);
        const endRange = Engine.parseCoord(SETTINGS.viagensConf.intervaloGeral.split(':')[1]);

        // DEBUG INTERNO: Verifique se estas coordenadas batem com a V4
        const cp = Engine.parseCoord(SETTINGS.cells.codProg);
        const cl = Engine.parseCoord(SETTINGS.cells.codLinha);

        const global = {
            codProg: sheetData[cp.row]?.[cp.col] || "",
            codLinha: sheetData[cl.row]?.[cl.col] || "",
            // codProg: sheetData[Engine.parseCoord(SETTINGS.cells.codProg).row][Engine.parseCoord(SETTINGS.cells.codProg).col],
            // codLinha: sheetData[Engine.parseCoord(SETTINGS.cells.codLinha).row][Engine.parseCoord(SETTINGS.cells.codLinha).col],
            tempoAcesso: Engine.toMin(sheetData[Engine.parseCoord(SETTINGS.cells.tempoAcesso).row][Engine.parseCoord(SETTINGS.cells.tempoAcesso).col]) || 0
        };

        // 1. Carregar Tabela de Exceções Unificada (A35:J55)
        const excCoord = Engine.parseCoord(SETTINGS.viagensConf.intervaloExcecoes);
        const excecoes = [];
        if (excCoord) {
            for (let r = excCoord.row; r <= 54; r++) { 
                if (sheetData[r] && sheetData[r][0]) {
                    excecoes.push({
                        carro: sheetData[r][0], 
                        viagem: sheetData[r][1],
                        sentido: sheetData[r][2],
                        tipo: sheetData[r][3],
                        novoTipo: sheetData[r][4],
                        novoLocal: sheetData[r][5],
                        novaLinha: sheetData[r][6]
                    });
                }
            }
        }

        let finalRows = [];

        // 2. Processar colunas (Carros)
        for (let c = range.col; c <= endRange.col; c++) {
            const carroID = sheetData[range.row + SETTINGS.viagensConf.linhaCarroID - 1][c];
            if (!carroID) continue;

            let viagensDoCarro = [];

            // Identificar eventos por continuidade
            for (let r = range.row + 3; r <= endRange.row; r++) {
                const valorSaida = sheetData[r][c];
                const minSaida = Engine.toMin(valorSaida);
                const isTrocaForcada = SETTINGS.viagensConf.linhasTrocaTurno.includes(r + 1);

                if (minSaida !== null) {
                    const proximoValor = (r < endRange.row) ? sheetData[r+1][c] : null;
                    const minChegada = Engine.toMin(proximoValor);
                    
                    if (minChegada !== null) {
                        // Viagem Produtiva
                        viagensDoCarro.push({
                            type: 'VIAGEM',
                            start: minSaida,
                            end: minChegada,
                            direction: sheetData[range.row + SETTINGS.viagensConf.linhaSentido - 1][c],
                            carro: carroID,
                            tipoInterno: SETTINGS.tipoProdutivo,
                            forcarNovaTabela: isTrocaForcada
                        });
                        r++; // Pula a linha de chegada
                    } else {
                        // Evento (Início sem fim imediato)
                        const existeMaisViagem = sheetData.slice(r+1, endRange.row+1).some(row => Engine.toMin(row[c]) !== null);
                        viagensDoCarro.push({
                            type: existeMaisViagem ? 'INTERVALO' : 'RECOLHE',
                            start: minSaida,
                            carro: carroID,
                            tipoInterno: SETTINGS.tipoOcioso,
                            forcarNovaTabela: isTrocaForcada
                        });
                    }
                }
            }

            // 3. Gerar Dados Formatados com Nomenclatura de Tabelas
            let idxNormal = 0;
            let idxIntervalo = 0;
            let tabelaAtual = SETTINGS.sequenciaNormal[idxNormal];

            viagensDoCarro.forEach((v, i) => {
                // Lógica de troca de letra da tabela
                if (i > 0) {
                    const anterior = viagensDoCarro[i-1];
                    if (anterior.type === 'INTERVALO') {
                        // Se veio de um "buraco", usa sequência de intervalo
                        tabelaAtual = SETTINGS.sequenciaPosIntervalo[idxIntervalo++] || "Z";
                    } else if (v.forcarNovaTabela || (v.type === 'VIAGEM' && anterior.type === 'VIAGEM')) {
                        // Se é troca imediata ou forçada por linhaTrocaTurno
                        tabelaAtual = SETTINGS.sequenciaNormal[++idxNormal] || "Y";
                    }
                }

                const exc = Engine.getExcecao(v, excecoes);
                const context = {
                    prog: global.codProg,
                    tab: tabelaAtual,
                    carro: v.carro,
                    start: Engine.minToTime(v.start),
                    end: v.end ? Engine.minToTime(v.end) : "",
                    direction: exc?.novoSentido || v.direction || "",
                    activity: exc?.novoTipo || (v.type === 'VIAGEM' ? SETTINGS.atividades.produtiva : (v.type === 'INTERVALO' ? SETTINGS.atividades.troca_turno : SETTINGS.atividades.recolhe)),
                    local: exc?.novoLocal || (v.type === 'VIAGEM' ? "" : (v.type === 'INTERVALO' ? "10" : "11")),
                    lin: exc?.novaLinha || global.codLinha,
                    isExcecaoLinha: !!exc?.novaLinha // Crucial para a regra do COD_LINHA vazio
                };

                if (v.type === 'VIAGEM') {
                    finalRows.push(Engine.applyLayout(context));
                } 
                else if (v.type === 'INTERVALO' && SETTINGS.geraEntradaIntervalos) {
                    finalRows.push(Engine.applyLayout(context));
                }
                else if (v.type === 'RECOLHE' && SETTINGS.geraEntradaRecolhidas) {
                    finalRows.push(Engine.applyLayout(context));
                }

            });
        }
        return finalRows;
    },

    applyLayout: (data) => {
        const mapped = {};
        SETTINGS.layout.forEach(conf => {
            // Se houver uma função resolve, ela tem prioridade
            if (typeof conf.resolve === 'function') {
                mapped[conf.field] = conf.resolve(data);
            } else {
                mapped[conf.field] = data[conf.field] || "";
            }
        });
        return mapped;
    }
};