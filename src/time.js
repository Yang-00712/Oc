// Time rules validate recognition; they never guess or silently repair digits.
export function parseTime(value) {
    const raw = String(value ?? '').trim();
    const match = raw.match(/^(\d{2}):?(\d{2})$/);
    if (!match) return { valid: false, raw, error: '請填 4 位數字，例如 0900。' };
    const hour = Number(match[1]), minute = Number(match[2]);
    if (hour > 23 || minute > 59) return { valid: false, raw, error: '小時須為 00–23，分鐘須為 00–59。' };
    return { valid: true, raw: match[1] + match[2], formatted: `${match[1]}:${match[2]}`, minutes: hour * 60 + minute };
}
export function exportTimes(rows, format = 'txt') {
    if (!Array.isArray(rows) || !rows.length) throw new Error('目前沒有結果。');
    const parsed = rows.map(row => parseTime(row.value));
    if (rows.some((row, i) => !row.confirmed || !parsed[i].valid)) throw new Error('請先核對並確認每一列；無效時間不可匯出。');
    if (format === 'txt') return parsed.map(time => time.formatted).join('\r\n') + '\r\n';
    if (format === 'csv') return '\ufeff"行號","時間"\r\n' + parsed.map((time, i) => `"${i + 1}","${time.formatted}"`).join('\r\n') + '\r\n';
    throw new Error('不支援的匯出格式。');
}
export function orderWarnings(rows) {
    let previous = null;
    return rows.map(row => {
        const time = parseTime(row.value);
        const backwards = time.valid && previous !== null && time.minutes < previous;
        if (time.valid) previous = time.minutes;
        return backwards;
    });
}
