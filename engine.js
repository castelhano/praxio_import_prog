/**
 * engine.js — Motor de processamento de escalas de transporte urbano
 *
 * Fluxo:
 *   1. Lê configurações globais da planilha (células conforme settings.cells)
 *   2. Para cada carro no intervalo de viagens (duas colunas por carro):
 *      a. Lê local de pegada personalizado (linha 3 da grade)
 *      b. Lê trocas de turno (linhas 29-31)
 *      c. Percorre células em zigzag montando viagens com início e fim
 *      d. Divide viagens em tabelas (por TT e por intervalo/recolhe)
 *      e. Nomeia tabelas, aplica exceções de tabela e de viagem, preparo, INIC_GAR
 *   3. Retorna array de { trip, global } prontos para o Exporter
 */

const Engine = {

    // =========================================================================
    // UTILITÁRIOS DE COORDENADA
    // =========================================================================

    /** Converte "C4" ou "AA12" → { row, col } (0-based) */
    parseCoord(coord) {
        if (!coord) return null;
        const m = coord.match(/^([A-Z]+)(\d+)$/);
        if (!m) return null;
        let col = 0;
        for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
        return { row: parseInt(m[2]) - 1, col: col - 1 };
    },

    /** Lê uma célula da matriz 2D pelo endereço Excel */
    getCell(matrix, coord) {
        const pos = this.parseCoord(coord);
        if (!pos) return null;
        return matrix[pos.row]?.[pos.col] ?? null;
    },

    /** Converte "I4:AV28" → { start: {row,col}, end: {row,col} } */
    parseRange(rangeStr) {
        const [a, b] = rangeStr.split(':');
        return { start: this.parseCoord(a), end: this.parseCoord(b) };
    },

    // =========================================================================
    // UTILITÁRIOS DE TEMPO
    // =========================================================================

    /**
     * Converte valor de célula para minutos inteiros.
     * - Número com fração: serial SheetJS com ou sem data (extrai apenas a parte horária)
     * - Número inteiro puro: minutos diretos (ex: preparo = 5)
     * - String "HH:MM" ou "H:MM": converte normalmente
     * - String numérica "10": minutos diretos
     * - Qualquer outro texto: retorna null
     */
    toMin(val) {
        if (val === null || val === undefined || val === '') return null;

        if (typeof val === 'number') {
            if (val % 1 === 0) return Math.round(val);       // inteiro = minutos diretos
            return Math.round((val % 1) * 24 * 60);          // extrai horário da fração
        }

        if (typeof val === 'string') {
            const s = val.trim();
            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
                const parts = s.split(':').map(Number);
                return parts[0] * 60 + parts[1];
            }
            if (/^\d+$/.test(s)) return parseInt(s, 10);
        }

        return null;
    },

    /**
     * Converte minutos → "HH:MM".
     * Aplica módulo 24h para garantir formato válido após virada de dia.
     */
    minToTime(m) {
        if (m === null || m === undefined || isNaN(m)) return '';
        const total = Math.round(m) % (24 * 60);
        if (total < 0) return '';
        const h   = Math.floor(total / 60);
        const min = total % 60;
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    },

    /**
     * Retorna true se b é cronologicamente posterior a a,
     * com suporte a virada de dia: diferença invertida > 12h = b é no dia seguinte.
     */
    isAfter(a, b) {
        if (b > a) return true;
        if (a - b > 12 * 60) return true;
        return false;
    },

    // =========================================================================
    // LEITURA DE CONFIGURAÇÕES
    // =========================================================================

    /**
     * Lê células de configuração do excel e retorna globalCtx.
     */
    readGlobalConfig(matrix) {
        const c = SETTINGS.cells;

        const rawCircular = c.ehCircular ? this.getCell(matrix, c.ehCircular) : null;
        const ehCircular  = rawCircular === "true" || rawCircular === 1 || rawCircular === '1';

        return {
            codProg:        this.getCell(matrix, c.codProg),
            codLinha:       this.getCell(matrix, c.codLinha),
            codIda:         String(this.getCell(matrix, c.codIda)         ?? ''),
            codVolta:       String(this.getCell(matrix, c.codVolta)       ?? ''),
            prepMins:       this.toMin(this.getCell(matrix, c.tempoPreparo)) ?? 0,
            acesMins:       this.toMin(this.getCell(matrix, c.tempoAcesso))  ?? 0,
            recoMins:       this.toMin(this.getCell(matrix, c.tempoRecolhe)) ?? 0,
            firstSeq:       SETTINGS.primeiroCodViagem,
            codLocalPegada: String(this.getCell(matrix, c.codLocalPegada) ?? ''),
            ehCircular,
        };
    },

    /**
     * Resolve o número do turno para uma tabela com base em settings.mapaTurnos.
     */
    resolveturno(tabStartMin) {
        const mapa = SETTINGS.mapaTurnos;
        const entradas = Object.entries(mapa)
            .map(([hora, turno]) => ({ corteMin: this.toMin(hora), turno }))
            .sort((a, b) => a.corteMin - b.corteMin);

        for (const { corteMin, turno } of entradas) {
            if (tabStartMin < corteMin) return turno;
        }

        return entradas[entradas.length - 1]?.turno ?? 1;
    },

    /**
     * Lê o intervalo de exceções de VIAGENS.
     *
     * Colunas (relativas ao início do intervalo):
     *   0=carro  1=viagem  2=sentido  3=tipo  (critérios)
     *   4=atividade  5=local  6=linha          (overrides)
     */
    readExcecoesViagens(matrix) {
        const rules = [];
        const { start, end } = this.parseRange(SETTINGS.viagensConf.intervaloExcecoesViagens);

        for (let r = start.row; r <= end.row; r++) {
            const row = matrix[r];
            if (!row) continue;

            const criterios  = {};
            const rawCarro   = row[start.col];
            const rawViagem  = row[start.col + 1];
            const rawSentido = row[start.col + 2];
            const rawTipo    = row[start.col + 3];

            if (rawCarro   != null && rawCarro   !== '') criterios.carro   = String(rawCarro).padStart(2, '0');
            if (rawViagem  != null && rawViagem  !== '') criterios.viagem  = this.toMin(rawViagem);
            if (rawSentido != null && rawSentido !== '') criterios.sentido = String(rawSentido).toUpperCase();
            if (rawTipo    != null && rawTipo    !== '') criterios.tipo    = String(rawTipo).toUpperCase();

            if (Object.keys(criterios).length === 0) continue;

            const overrides    = {};
            const overrideDefs = [
                ['atividade', start.col + 4, v => String(v)],
                ['local',     start.col + 5, v => String(v)],
                ['linha',     start.col + 6, v => String(v)],
            ];
            for (const [field, colIdx, fn] of overrideDefs) {
                const v = row[colIdx];
                if (v != null && v !== '') overrides[field] = fn(v);
            }

            rules.push({ criterios, overrides });
        }
        return rules;
    },

    /**
     * Lê o intervalo de exceções de TABELAS.
     *
     * Colunas (relativas ao início do intervalo):
     *   0=tabela  1=nome  2=inicio  3=fim  4=periodo
     *   5=saida_garagem  6=preparo  7=acesso  8=recolhe
     */
    readExcecoesTabelas(matrix) {
        const map = new Map();
        const { start, end } = this.parseRange(SETTINGS.viagensConf.intervaloExcecoesTabelas);

        for (let r = start.row; r <= end.row; r++) {
            const row = matrix[r];
            if (!row) continue;

            const rawTab = row[start.col];
            if (rawTab == null || rawTab === '') continue;

            const tabKey    = String(rawTab).trim().toUpperCase();
            const overrides = {};

            const defs = [
                ['nome',         start.col + 1, v => String(v).trim()],
                ['inicio',       start.col + 2, v => this.toMin(v)   ],
                ['fim',          start.col + 3, v => this.toMin(v)   ],
                ['periodo',      start.col + 4, v => parseInt(v, 10) ],
                ['saidaGaragem', start.col + 5, v => this.toMin(v)   ],
                ['preparo',      start.col + 6, v => this.toMin(v)   ],
                ['acesso',       start.col + 7, v => this.toMin(v)   ],
                ['recolhe',      start.col + 8, v => this.toMin(v)   ],
            ];

            for (const [field, colIdx, fn] of defs) {
                const v = row[colIdx];
                if (v != null && v !== '') overrides[field] = fn(v);
            }

            if (Object.keys(overrides).length > 0) {
                map.set(tabKey, overrides);
            }
        }
        return map;
    },

    /**
     * Aplica regras de exceção de VIAGEM a uma viagem.
     * @param {string} tipo - "P" (produtiva) ou "O" (ociosa/TT/intervalo/recolhe)
     */
    applyExcecoesViagens(rules, carroID, startMin, sentido, tipo) {
        const merged = {};
        for (const { criterios, overrides } of rules) {
            if (criterios.carro   !== undefined && criterios.carro   !== carroID)  continue;
            if (criterios.viagem  !== undefined && criterios.viagem  !== startMin) continue;
            if (criterios.sentido !== undefined && criterios.sentido !== sentido)  continue;
            if (criterios.tipo    !== undefined && criterios.tipo    !== tipo)     continue;
            Object.assign(merged, overrides);
        }
        return merged;
    },

    // =========================================================================
    // TROCAS DE TURNO
    // =========================================================================

    /**
     * Lê as linhas de TT para um carro.
     * Retorna array de { min, sentido } em ordem cronológica.
     *
     * Em modo circular o sentido registrado é sempre 'C' (todas as viagens
     * circulares usam dir='C', então o validTripsSet também usa 'C').
     */
    readTrocasTurno(matrix, colIda, colVolta, validTripsSet, ehCircular) {
        const linhas = SETTINGS.viagensConf.linhasTrocaTurno;
        const result = [];

        for (let i = 0; i < linhas.length; i++) {
            if (i > 0 && result.length < i) break;

            const rowIdx   = linhas[i] - 1;
            const minIda   = this.toMin(matrix[rowIdx]?.[colIda]);
            const minVolta = this.toMin(matrix[rowIdx]?.[colVolta]);

            let min = null, sentido = null;

            if (minIda !== null) {
                min     = minIda;
                sentido = ehCircular ? 'C' : 'I';
            } else if (minVolta !== null) {
                min     = minVolta;
                sentido = ehCircular ? 'C' : 'V';
            } else {
                break;
            }

            if (!validTripsSet.has(`${min}_${sentido}`)) continue;
            if (result.length > 0 && !this.isAfter(result[result.length - 1].min, min)) continue;

            result.push({ min, sentido });
        }

        return result;
    },

    // =========================================================================
    // ZIGZAG — MONTAGEM DE VIAGENS BRUTAS
    // =========================================================================

    /**
     * Percorre colunas de um carro e retorna viagens brutas.
     *
     * Modo normal (zigzag IDA/VOLTA):
     *   Viagem IDA:   start=colIda[r],   end=colVolta[r]
     *   Viagem VOLTA: start=colVolta[r], end=colIda[r+1]
     *   Texto em qualquer célula é ignorado (toMin retorna null).
     *
     * Modo circular:
     *   Viagem normal C:   colIda[r] tem hora, colVolta[r] vazio ou texto
     *                      dir='C', start=colIda[r], end=colIda[r+1]
     *   Meia viagem IDA:   colIda[r] tem hora E colVolta[r] tem hora
     *                      dir = circularMeiaViagemConsisteSentido ? 'I' : 'C'
     *                      start=colIda[r], end=colVolta[r]
     *   Meia viagem VOLTA: colIda[r] vazio/texto, colVolta[r] tem hora
     *                      dir = circularMeiaViagemConsisteSentido ? 'V' : 'C'
     *                      start=colVolta[r], end=colIda[r+1]
     *                      Só gerada se circularGeraMeiaViagem=true E
     *                      for a primeira viagem ou primeira após intervalo.
     *
     * Retorna { dir, start, end|null, hasEnd, row }[]
     */
    buildTrips(matrix, colIda, colVolta, rowStart, rowEnd, ehCircular) {
        const trips = [];

        if (!ehCircular) {
            // ── Modo normal: zigzag IDA/VOLTA ──
            for (let r = rowStart; r <= rowEnd; r++) {
                const vIda   = this.toMin(matrix[r]?.[colIda]);
                const vVolta = this.toMin(matrix[r]?.[colVolta]);

                if (vIda !== null) {
                    trips.push({
                        dir: 'I', start: vIda,
                        end: vVolta,
                        hasEnd: vVolta !== null,
                        row: r,
                    });
                }

                if (vVolta !== null) {
                    const nextIda = (r < rowEnd) ? this.toMin(matrix[r + 1]?.[colIda]) : null;
                    trips.push({
                        dir: 'V', start: vVolta,
                        end: nextIda,
                        hasEnd: nextIda !== null,
                        row: r,
                    });
                }
            }
        } else {
            // ── Modo circular ──
            const geraMeiaViagem  = SETTINGS.circularGeraMeiaViagem           ?? true;
            const consisteSentido = SETTINGS.circularMeiaViagemConsisteSentido ?? false;
            const codMeiaIda      = consisteSentido ? 'I' : 'C';
            const codMeiaVolta    = consisteSentido ? 'V' : 'C';

            let meiaVoltaPermitida = true;

            for (let r = rowStart; r <= rowEnd; r++) {
                const rawVolta  = matrix[r]?.[colVolta];
                const vIda      = this.toMin(matrix[r]?.[colIda]);
                const vVolta    = this.toMin(rawVolta);
                // Célula volta com conteúdo não-hora (texto como RECO) — deve ser ignorada AQUIIIIIIIIIIIIIII
                // const voltaTemTexto = rawVolta != null && rawVolta !== '' && vVolta === null;

                if (vIda !== null && vVolta !== null) {
                    // ── Meia viagem IDA: término prematuro com hora válida na volta ──
                    const nextIda = (r < rowEnd) ? this.toMin(matrix[r + 1]?.[colIda]) : null;
                    trips.push({
                        dir: codMeiaIda, start: vIda,
                        end: vVolta,
                        hasEnd: nextIda !== null,
                        row: r,
                    });
                    meiaVoltaPermitida = nextIda === null; // ← permite meia VOLTA se for intervalo

                } else if (vIda !== null) {
                    // ── Viagem circular normal (volta vazia ou com texto ignorado) ──
                    const nextIda = (r < rowEnd) ? this.toMin(matrix[r + 1]?.[colIda]) : null;
                    trips.push({
                        dir: 'C', start: vIda,
                        end: nextIda,
                        hasEnd: nextIda !== null,
                        row: r,
                    });
                    meiaVoltaPermitida = false;

                } else if (vVolta !== null) {
                    // ── Meia viagem VOLTA: início anormal ──
                    if (meiaVoltaPermitida) {
                        const nextIda = (r < rowEnd) ? this.toMin(matrix[r + 1]?.[colIda]) : null;
                        trips.push({
                            dir: codMeiaVolta, start: vVolta,
                            end: nextIda,
                            hasEnd: nextIda !== null,
                            suppressed: !geraMeiaViagem,
                            row: r,
                        });
                    }
                    meiaVoltaPermitida = false;
                }

                // Viagem sem fim = intervalo → próxima tabela permite meia viagem VOLTA
                const last = trips[trips.length - 1];
                if (last && !last.hasEnd) {
                    meiaVoltaPermitida = true;
                }
            }
        }

        return trips;
    },

    // =========================================================================
    // DIVISÃO EM TABELAS
    // =========================================================================

    /**
     * Divide trips em tabelas aplicando cortes de TT e intervalo.
     *
     * Cada tabela: { trips[], ttEnd, isLastTable, isIntervalo, isPostIntervalo }
     */
    splitIntoTables(trips, trocas) {
        const tables      = [];
        let current       = [];
        let ttQueue       = [...trocas];
        let postIntervalo = false;

        for (let i = 0; i < trips.length; i++) {
            const t = trips[i];

            // ── Corte de TT ──
            if (ttQueue.length > 0) {
                const tt = ttQueue[0];
                if (t.start === tt.min && t.dir === tt.sentido) {
                    tables.push({
                        trips:           current,
                        ttEnd:           tt,
                        isLastTable:     false,
                        isIntervalo:     false,
                        isPostIntervalo: postIntervalo,
                    });
                    current       = [];
                    postIntervalo = false;
                    ttQueue.shift();
                }
            }

            current.push(t);

            // ── Intervalo ou recolhe (sem fim) ──
            if (!t.hasEnd) {
                const hasMore = i < trips.length - 1;

                if (hasMore) {
                    tables.push({
                        trips:           current,
                        ttEnd:           null,
                        isLastTable:     false,
                        isIntervalo:     true,
                        isPostIntervalo: postIntervalo,
                    });
                    current       = [];
                    postIntervalo = true;
                }
            }
        }

        if (current.length > 0) {
            tables.push({
                trips:           current,
                ttEnd:           null,
                isLastTable:     true,
                isIntervalo:     false,
                isPostIntervalo: postIntervalo,
            });
        }

        return tables;
    },

    // =========================================================================
    // NOMEAÇÃO DE TABELAS
    // =========================================================================

    /**
     * Retorna a próxima letra disponível para nomear uma tabela.
     */
    nextLetter(isFirstTable, isPostIntervalo, usedLetters) {
        if (isFirstTable) return SETTINGS.sequenciaNormal[0];
        const seq = isPostIntervalo
            ? SETTINGS.sequenciaPosIntervalo
            : SETTINGS.sequenciaNormal;
        return seq.find(l => !usedLetters.includes(l)) ?? '?';
    },

    // =========================================================================
    // CONSTRUÇÃO DE CONTEXTOS POR VIAGEM
    // =========================================================================

    /**
     * Monta contextos { trip, global } para todas as viagens de uma tabela.
     *
     * Local de encerramento (TT/intervalo/recolhe):
     *   Prioridade: exceção de viagem → settings.atividades[X].local → regra geral por sentido
     */
    buildTableRows(opts) {
        const {
            carroID, tabName, isFirstTable,
            trips, ttEnd, isLastTable, isIntervalo,
            globalCtx, excViagensRules, tabOverrides,
            codLocalIda, codLocalVolta,
        } = opts;

        if (trips.length === 0) return [];

        const firstTrip = trips[0];
        const lastTrip  = trips[trips.length - 1];

        // ── NOME DA TABELA ──
        const resolvedTabName = tabOverrides.nome ?? tabName;

        // ── TURN ──
        const tabStartMinForTurn = tabOverrides.inicio ?? firstTrip.start;
        const turn = tabOverrides.periodo ?? this.resolveturno(tabStartMinForTurn);

        // ── PREPARO ──
        const preparo = tabOverrides.preparo ?? globalCtx.prepMins;

        // ── ACESSO ──
        const acesMins = tabOverrides.acesso ?? globalCtx.acesMins;

        // ── RECOLHE BASE ──
        const recoMinsBase = tabOverrides.recolhe ?? globalCtx.recoMins;

        // ── INIC_GAR ──
        let garageStart;
        if (tabOverrides.saidaGaragem != null) {
            garageStart = isFirstTable ? this.minToTime(tabOverrides.saidaGaragem) : '';
        } else {
            garageStart = isFirstTable
                ? this.minToTime(firstTrip.start - acesMins)
                : '';
        }

        // ── COD_PEGADA ──
        const pegada = isFirstTable
            ? globalCtx.codLocalPegada
            : (firstTrip.dir === 'V' ? codLocalVolta : codLocalIda);

        // ── tabStart ──
        const tabStartMin = tabOverrides.inicio ?? firstTrip.start;
        const tabStart    = this.minToTime(tabStartMin);

        // ── tabEnd ──
        const recoExc  = this.applyExcecoesViagens(excViagensRules, carroID, lastTrip.start, lastTrip.dir, 'O');
        const recoMins = tabOverrides.recolhe ?? recoExc.recolhe ?? recoMinsBase;

        let tabEndMin;
        if (tabOverrides.fim != null) {
            tabEndMin = tabOverrides.fim;
        } else if (ttEnd) {
            tabEndMin = ttEnd.min;
        } else if (isIntervalo) {
            tabEndMin = lastTrip.start;
        } else {
            tabEndMin = (lastTrip.end ?? lastTrip.start) + recoMins;
        }
        const tabEnd = this.minToTime(tabEndMin);

        // ── Helper para montar o objeto trip ──
        const makeTripCtx = (dir, startMin, endMin, seqStr, activity, localCode, excOverride) => ({
            tab:            resolvedTabName,
            turn:           String(turn),
            tabStart,
            tabEnd,
            garageStart,
            pegada,
            preparo:        String(excOverride?.preparo ?? preparo),
            direction:      dir,
            seq:            seqStr,
            departure:      this.minToTime(startMin),
            arrival:        this.minToTime(endMin),
            activity,
            localCode,
            codLinha:       excOverride?.linha ?? null,
            isExcecaoLinha: !!(excOverride?.linha),
        });

        /**
         * Sentido oposto para encerramentos (intervalo/recolhe).
         * 'C' e demais códigos circulares não invertem.
         */
        const dirOposto = (dir) => {
            if (dir === 'I') return 'V';
            if (dir === 'V') return 'I';
            return dir;
        };

        /**
         * Resolve o local de encerramento para uma atividade.
         * Prioridade: exceção de viagem → settings.atividades[chave].local → codLocal por sentido
         */
        const localEncerramento = (excOverride, atividadeKey, dir) => {
            if (excOverride?.local) return excOverride.local;
            const atLocal = SETTINGS.atividades[atividadeKey]?.local;
            if (atLocal != null) return atLocal;
            return dir === 'V' ? codLocalVolta : codLocalIda;
        };

        // ── Gerar linhas ──
        const rows = [];
        let seq = globalCtx.firstSeq;

        for (let i = 0; i < trips.length; i++) {
            const t      = trips[i];
            const isLast = (i === trips.length - 1);
            
            const skipProdutiva = isLast && !t.hasEnd || t.suppressed;

            if(!skipProdutiva){ // se ultima viagem sera tratada pelos blocos 
                
                const exc       = this.applyExcecoesViagens(excViagensRules, carroID, t.start, t.dir, 'P');
                const localCode = exc.local ?? (t.dir === 'V' ? codLocalVolta : codLocalIda);
                
                rows.push({
                    trip: makeTripCtx(
                        t.dir, t.start, t.end ?? t.start,
                        String(seq),
                        exc.atividade ?? SETTINGS.atividades.produtiva.cod,
                        localCode, exc
                    ),
                    global: globalCtx,
                });
                seq++;
            }
            
            // ── Linha de encerramento ──
            if (isLast) {
                const dirEnc = dirOposto(t.dir);

                // ── Troca de turno ──
                if (ttEnd && SETTINGS.geraEntradaTrocaTurno) {
                    const excTT = this.applyExcecoesViagens(excViagensRules, carroID, ttEnd.min, ttEnd.sentido, 'O');
                    const atTT  = excTT.atividade ?? SETTINGS.atividades.troca_turno.cod;
                    const lcTT  = localEncerramento(excTT, 'troca_turno', ttEnd.sentido);
                    rows.push({ trip: makeTripCtx(ttEnd.sentido, ttEnd.min, ttEnd.min, String(seq), atTT, lcTT, excTT), global: globalCtx });

                // ── Intervalo ──
                } else if (isIntervalo && SETTINGS.geraEntradaIntervalo) {
                    const excInt = this.applyExcecoesViagens(excViagensRules, carroID, t.start, dirEnc, 'O');
                    const atInt  = excInt.atividade ?? SETTINGS.atividades.intervalo.cod;
                    const lcInt  = localEncerramento(excInt, 'intervalo', dirEnc);
                    rows.push({ trip: makeTripCtx(dirEnc, t.start, t.start, String(seq), atInt, lcInt, excInt), global: globalCtx });

                // ── Recolhe ──
                } else if (isLastTable && SETTINGS.geraEntradaRecolhidas) {
                    const endMin = (t.end ?? t.start) + recoMins;
                    const atReco = recoExc.atividade ?? SETTINGS.atividades.recolhe.cod;
                    const lcReco = localEncerramento(recoExc, 'recolhe', dirEnc);
                    rows.push({ trip: makeTripCtx(dirEnc, t.end ?? t.start, endMin, String(seq), atReco, lcReco, recoExc), global: globalCtx });
                }
            }
        }
        return rows;
    },

    // =========================================================================
    // PONTO DE ENTRADA
    // =========================================================================

    /**
     * Processa o workbook e retorna array de { trip, global } para o Exporter.
     * @param {object} workbook - SheetJS workbook (XLSX.read)
     */
    process(workbook) {
        const sheet  = workbook.Sheets[SETTINGS.guiaAnalise];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

        const globalCtx       = this.readGlobalConfig(matrix);
        const excViagensRules = this.readExcecoesViagens(matrix);
        const excTabelasMap   = this.readExcecoesTabelas(matrix);

        const vConf              = SETTINGS.viagensConf;
        const { start: vS, end: vE } = this.parseRange(vConf.intervaloGeral);

        const allRows = [];

        for (let c = vS.col; c <= vE.col; c += 2) {
            const colIda   = c;
            const colVolta = c + 1;

            // Identificar carro
            const rawID = matrix[vConf.linhaCarroID - 1]?.[colIda];
            if (rawID == null || rawID === '' || rawID === 0) continue;
            const rawStr = String(rawID);
            if (rawStr.startsWith('=')) continue;
            const carroID = rawStr.padStart(2, '0');
            if (carroID === '00') continue;

            // Local de pegada personalizado (linha 3) ou padrão global
            const lr = vConf.linhaLocalidade - 1;
            const codLocalIda   = String(matrix[lr]?.[colIda]   || '') || globalCtx.codIda;
            const codLocalVolta = String(matrix[lr]?.[colVolta] || '') || globalCtx.codVolta;

            // Montar viagens (modo normal ou circular)
            const trips = this.buildTrips(matrix, colIda, colVolta, vS.row, vE.row, globalCtx.ehCircular);
            if (trips.length === 0) continue;

            const validTripsSet = new Set(trips.map(t => `${t.start}_${t.dir}`));
            const trocas        = this.readTrocasTurno(matrix, colIda, colVolta, validTripsSet, globalCtx.ehCircular);
            const tables        = this.splitIntoTables(trips, trocas);

            const usedLetters = [];
            tables.forEach((table, idx) => {
                const isFirstTable = (idx === 0);
                const letter       = this.nextLetter(isFirstTable, table.isPostIntervalo, usedLetters);
                const tabName      = carroID + letter;
                usedLetters.push(letter);

                const tabOverrides = excTabelasMap.get(tabName.toUpperCase()) ?? {};

                const rows = this.buildTableRows({
                    carroID, tabName, isFirstTable,
                    trips:       table.trips,
                    ttEnd:       table.ttEnd,
                    isLastTable: table.isLastTable,
                    isIntervalo: table.isIntervalo,
                    globalCtx, excViagensRules, tabOverrides,
                    codLocalIda, codLocalVolta,
                });

                allRows.push(...rows);
            });
        }

        return allRows;
    },
};
