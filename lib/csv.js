/**
 * CSV parser — handles quoted fields, escaped quotes, newlines in fields.
 *
 * parseCSV(csvText) → string[][]  (array of rows, each row is array of fields)
 */

function parseCSV(csvText) {
    const lines = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        if (char === '"') {
            if (inQuotes && csvText[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (current.length > 0 || lines.length > 0) {
                lines.push(current);
                current = '';
            }
            if (char === '\r' && csvText[i + 1] === '\n') i++;
        } else {
            current += char;
        }
    }
    if (current) lines.push(current);

    return lines.map(line => {
        const fields = [];
        let field = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
                if (inQ && line[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQ = !inQ;
                }
            } else if (c === ',' && !inQ) {
                fields.push(field);
                field = '';
            } else {
                field += c;
            }
        }
        fields.push(field);
        return fields;
    });
}

module.exports = { parseCSV };
