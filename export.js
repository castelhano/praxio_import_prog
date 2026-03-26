const Exporter = {
    // A mágica do Alinhamento e Preenchimento acontece aqui
    formatField: (value, config) => {
        let s = String(value !== undefined && value !== null ? value : "");
        
        if (config.type === "hour" && s.includes(":")) {
            s = s.substring(0, 5);
        }

        const size = config.size;
        const padChar = config.pad || " ";
        const align = (config.align || "L").toUpperCase();

        if (align === "R") {
            s = s.padStart(size, padChar);
        } else {
            s = s.padEnd(size, padChar);
        }

        return s.substring(0, size);
    },

    toTXT: (processedData) => {
        return processedData.map(row => {
            return SETTINGS.layout.map(conf => 
                Exporter.formatField(row[conf.field], conf)
            ).join("");
        }).join("\r\n");
    },

    toCSV: (processedData) => {
        // 1. Gera o cabeçalho usando os nomes dos campos
        const headers = SETTINGS.layout.map(c => c.field).join(";");

        // 2. Gera o corpo verificando a flag de formatação
        const body = processedData.map(row => {
            return SETTINGS.layout.map(conf => {
                // Se aplicarFormatacaoNoCsv for true, usa o formatField. 
                // Caso contrário, retorna o valor original da linha.
                return SETTINGS.aplicarFormatacaoNoCsv 
                    ? Exporter.formatField(row[conf.field], conf)
                    : row[conf.field];
            }).join(";");
        }).join("\n");

        return `${headers}\n${body}`;
    },

    download: (content, filename, mime) => {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = filename;
        
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
    }
};