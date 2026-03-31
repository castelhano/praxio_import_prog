/**
 * export.js — Formatação e exportação de arquivos
 *
 * Responsabilidade única: receber o array de contextos { trip, global }
 * produzido pelo Engine e gerar a saída formatada (TXT posicional ou CSV).
 *
 * Nenhuma regra de negócio aqui — toda lógica está no Engine e no settings.layout.
 */

const Exporter = {

    /**
     * Formata um valor conforme a definição do campo no settings.layout.
     *
     * @param {*}      value  - valor já resolvido (string, number…)
     * @param {object} conf   - entrada do settings.layout { size, pad, align, type }
     * @returns {string} - string com exatamente conf.size caracteres
     */
    formatField(value, conf) {
        // Normalizar para string
        let s = (value !== undefined && value !== null) ? String(value) : '';

        // Truncar campo de hora para "HH:MM" (ignora segundos se vier "HH:MM:SS")
        if (conf.type === 'hour' && s.length > 5) {
            s = s.substring(0, 5);
        }

        const size    = conf.size;
        const padChar = conf.pad ?? ' ';
        const align   = (conf.align ?? 'L').toUpperCase();

        // Padding
        s = align === 'R'
            ? s.padStart(size, padChar)
            : s.padEnd(size, padChar);

        // Garantir tamanho exato (trunca se o valor for maior que o campo)
        return s.substring(0, size);
    },

    /**
     * Resolve todos os campos de um contexto usando settings.layout.
     * Retorna array de strings formatadas, uma por campo.
     *
     * @param {object} ctx - { trip, global }
     */
    resolveRow(ctx) {
        return SETTINGS.layout.map(conf => {
            const value = (typeof conf.resolve === 'function')
                ? conf.resolve(ctx)
                : (ctx.trip[conf.field] ?? '');
            return this.formatField(value, conf);
        });
    },

    /**
     * Gera arquivo TXT posicional (fixed-width).
     * Cada linha é a concatenação de todos os campos formatados.
     *
     * @param {Array} data - array de { trip, global }
     * @returns {string}
     */
    toTXT(data) {
        return data
            .map(ctx => this.resolveRow(ctx).join(''))
            .join('\r\n');
    },

    /**
     * Gera arquivo CSV separado por ponto e vírgula.
     * Primeira linha: nomes dos campos (headers).
     * Demais linhas: valores, com ou sem formatação conforme settings.aplicarFormatacaoNoCsv.
     *
     * @param {Array} data - array de { trip, global }
     * @returns {string}
     */
    toCSV(data) {
        const headers = SETTINGS.layout.map(c => c.field).join(';');

        const body = data.map(ctx => {
            return SETTINGS.layout.map(conf => {
                const value = (typeof conf.resolve === 'function')
                    ? conf.resolve(ctx)
                    : (ctx.trip[conf.field] ?? '');

                return SETTINGS.aplicarFormatacaoNoCsv
                    ? this.formatField(value, conf)
                    : (value ?? '');
            }).join(';');
        }).join('\r\n');

        return `${headers}\n${body}`;
    },

    /**
     * Dispara download de um arquivo no navegador.
     *
     * @param {string} content  - conteúdo do arquivo
     * @param {string} filename - nome do arquivo a baixar
     * @param {string} mime     - tipo MIME ('text/plain' ou 'text/csv')
     */
    download(content, filename, mime) {
        const blob = new Blob([content], { type: mime });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');

        a.href     = url;
        a.download = filename;

        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
    },
};
