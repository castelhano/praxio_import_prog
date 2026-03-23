const Exporter = {
    // A mágica do Alinhamento e Preenchimento acontece aqui
    formatField: (value, config) => {
        let s = String(value !== undefined && value !== null ? value : "");
        
        // Tratamento de Horas (HH:mm)
        if (config.type === "hour" && s.includes(":")) {
            s = s.substring(0, 5);
        }

        const size = config.size;
        const padChar = config.pad || " ";
        const align = (config.align || "L").toUpperCase();

        // Se alinhar à Direita (R), preenche no início (padStart) -> ex: 0001
        // Se alinhar à Esquerda (L), preenche no fim (padEnd) -> ex: TAB  
        if (align === "R") {
            s = s.padStart(size, padChar);
        } else {
            s = s.padEnd(size, padChar);
        }

        // Garante que o texto nunca ultrapasse o tamanho da coluna
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

        // 2. Gera o corpo formatando cada célula conforme as regras de Pad/Align/Type
        const body = processedData.map(row => {
            return SETTINGS.layout.map(conf => {
                return Exporter.formatField(row[conf.field], conf);
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