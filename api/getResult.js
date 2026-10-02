// Вспомогательная функция перевода LAB в RGB для отрисовки плашек
function labToRgb(l, a, b) {
    let y = (l + 16) / 116;
    let x = a / 500 + y;
    let z = y - b / 200;

    let x3 = Math.pow(x, 3), y3 = Math.pow(y, 3), z3 = Math.pow(z, 3);
    x = (x3 > 0.008856 ? x3 : (x - 16 / 116) / 7.787) * 0.95047;
    y = (y3 > 0.008856 ? y3 : (y - 16 / 116) / 7.787) * 1.00000;
    z = (z3 > 0.008856 ? z3 : (z - 16 / 116) / 7.787) * 1.08883;

    let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
    let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
    let b_val = x * 0.0557 + y * -0.2040 + z * 1.0570;

    r = r > 0.0031308 ? (1.055 * Math.pow(r, 1 / 2.4) - 0.055) : 12.92 * r;
    g = g > 0.0031308 ? (1.055 * Math.pow(g, 1 / 2.4) - 0.055) : 12.92 * g;
    b_val = b_val > 0.0031308 ? (1.055 * Math.pow(b_val, 1 / 2.4) - 0.055) : 12.92 * b_val;

    return {
        r: Math.max(0, Math.min(255, Math.round(r * 255))),
        g: Math.max(0, Math.min(255, Math.round(g * 255))),
        b: Math.max(0, Math.min(255, Math.round(b_val * 255)))
    };
}

export function getResult(data) {
    const {
        rawMean, rawMedian,
        m1D_1, m1D_2, m1D_3, m1D_4, m1D_5,
        m3D_1, m3D_2, m3D_3, m3D_4, m3D_5
    } = data;

    // 1. Берем строго 10 результатов (5 из 1D и 5 из 3D)
    const scores = [
        m1D_1.percent, m1D_2.percent, m1D_3.percent, m1D_4.percent, m1D_5.percent,
        m3D_1.percent, m3D_2.percent, m3D_3.percent, m3D_4.percent, m3D_5.percent
    ];

    // 2. Считаем чистое среднее арифметическое
    const sum = scores.reduce((acc, val) => acc + val, 0);
    const finalScore = Math.round((sum / scores.length) * 10) / 10;

    // 3. Генерация строки таблицы
    const renderMethodRow = (title, resObj, isRaw = false) => {
        const stdLab = isRaw ? resObj.stdColor : resObj.stdCorr;
        const smpLab = isRaw ? resObj.smpColor : resObj.smpCorr;
        const stdRgb = labToRgb(stdLab.l, stdLab.a, stdLab.b);
        const smpRgb = labToRgb(smpLab.l, smpLab.a, smpLab.b);

        return `
        <div class="method-row">
            <div class="method-info">
                <span class="method-name">${title}</span>
                <span class="method-subtext">
                    <span class="${resObj.status.class}">${resObj.status.text}</span> • ΔE = ${resObj.diff}
                </span>
            </div>
            <div class="method-score">
                <div class="swatches-pair">
                    <div class="swatch-mini" style="background: rgb(${stdRgb.r},${stdRgb.g},${stdRgb.b})" title="Эталон"></div>
                    <div class="swatch-mini" style="background: rgb(${smpRgb.r},${smpRgb.g},${smpRgb.b})" title="Образец"></div>
                </div>
                <span class="score-val ${resObj.status.class}">${resObj.percent}%</span>
            </div>
        </div>
        `;
    };

    // 4. Формирование итогового HTML
    const html = `
        <div class="comparison-block" style="border: 1px solid rgba(255, 179, 0, 0.4);">
            <div class="comparison-title raw">📷 Прямое сравнение в LAB (без коррекции)</div>
            <div class="methods-list">
                ${renderMethodRow('Сырые данные (Среднее)', rawMean, true)}
                ${renderMethodRow('Сырые данные (Медиана)', rawMedian, true)}
            </div>
        </div>

        <div class="comparison-block" style="border: 1px solid rgba(0, 229, 255, 0.35);">
            <div class="comparison-title corrected">✨ Сравнение методов 1D коррекции</div>
            <div class="methods-list">
                ${renderMethodRow('1D Gain + Offset (Черный/Белый)', m1D_1)}
                ${renderMethodRow('1D Линейное + Среднее', m1D_2)}
                ${renderMethodRow('1D Линейное + Медианное', m1D_3)}
                ${renderMethodRow('1D Сплайновое + Среднее', m1D_4)}
                ${renderMethodRow('1D Сплайновое + Медианное', m1D_5)}
            </div>
        </div>

        <div class="comparison-block" style="border: 1px solid rgba(139, 92, 246, 0.35);">
            <div class="comparison-title corrected-3d">🔮 Сравнение методов 3D коррекции</div>
            <div class="methods-list">
                ${renderMethodRow('3D IDW (Инверсно-взвешенное)', m3D_1)}
                ${renderMethodRow('3D Аффинное + Среднее', m3D_2)}
                ${renderMethodRow('3D Аффинное + Медианное', m3D_3)}
                ${renderMethodRow('3D TPS Сплайн + Среднее', m3D_4)}
                ${renderMethodRow('3D TPS Сплайн + Медианное', m3D_5)}
            </div>
        </div>

        <div class="comparison-block" style="border: 1px solid rgba(0, 230, 118, 0.4); background: rgba(0, 230, 118, 0.03);">
            <div class="comparison-title final">🏆 Итоговый вердикт (Чистая математика)</div>
            <div class="final-summary">
                <div class="final-total-row">
                    <span class="final-total-label">Среднее арифметическое (10 методов 1D + 3D):</span>
                    <span class="final-total-value">${finalScore}%</span>
                </div>
            </div>
        </div>
    `;

    return { html, finalScore };
}
