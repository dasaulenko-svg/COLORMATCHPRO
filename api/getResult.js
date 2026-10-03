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

    // --- 1. Обработка сырых данных и подсчёт бонуса/штрафа ---
    const rawE1 = Number(rawMean.diff);
    const rawE2 = Number(rawMedian.diff);
    const avgRawDeltaE = Math.round(((rawE1 + rawE2) / 2) * 100) / 100;

    let rawModifier = 0;
    let rawModifierText = '0%';
    let rawStatusClass = 'neutral';

    if (avgRawDeltaE < 4) {
        rawModifier = 2;
        rawModifierText = '+2% (Бонус)';
        rawStatusClass = 'good';
    } else if (avgRawDeltaE > 8) {
        rawModifier = -2;
        rawModifierText = '-2% (Штраф)';
        rawStatusClass = 'bad';
    } else {
        rawModifier = 0;
        rawModifierText = '0% (Без изменений)';
        rawStatusClass = 'neutral';
    }

    // --- 2. Раздельный подсчёт среднего для 1D методов ---
    const scores1D = [
        m1D_1.percent, m1D_2.percent, m1D_3.percent, m1D_4.percent, m1D_5.percent
    ];
    const avg1D = Math.round((scores1D.reduce((acc, val) => acc + val, 0) / scores1D.length) * 10) / 10;

    // --- 3. Раздельный подсчёт среднего для 3D методов ---
    const scores3D = [
        m3D_1.percent, m3D_2.percent, m3D_3.percent, m3D_4.percent, m3D_5.percent
    ];
    const avg3D = Math.round((scores3D.reduce((acc, val) => acc + val, 0) / scores3D.length) * 10) / 10;

    // --- 4. Базовый консенсус (среднее между 1D и 3D) ---
    const baseScore = Math.round(((avg1D + avg3D) / 2) * 10) / 10;

    // --- 5. Итоговый результат с учётом модификатора сырых данных ---
    const calculatedScore = baseScore + rawModifier;
    const finalScore = Math.min(100, Math.max(0, Math.round(calculatedScore * 10) / 10));

    // --- 6. Генерация строки таблицы ---
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

    // --- 7. Формирование итогового HTML ---
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
            <div class="comparison-title final">🏆 Итоговый вердикт с учётом консенсуса</div>
            <div class="final-summary">
                <div class="final-total-row">
                    <span class="final-total-label">Среднее 1D методов (5 методов):</span>
                    <span class="final-total-value">${avg1D}%</span>
                </div>
                <div class="final-total-row">
                    <span class="final-total-label">Среднее 3D методов (5 методов):</span>
                    <span class="final-total-value">${avg3D}%</span>
                </div>
                <div class="final-total-row">
                    <span class="final-total-label">Базовый консенсус (1D + 3D):</span>
                    <span class="final-total-value">${baseScore}%</span>
                </div>
                <div class="final-total-row">
                    <span class="final-total-label">Среднее ΔE сырых данных:</span>
                    <span class="final-total-value">${avgRawDeltaE} (Модификатор: ${rawModifierText})</span>
                </div>
                <div class="final-total-row" style="margin-top: 8px; font-weight: bold; border-top: 1px dashed rgba(255,255,255,0.2); padding-top: 8px;">
                    <span class="final-total-label">Итоговый вердикт (Базовое + Модификатор сырых):</span>
                    <span class="final-total-value" style="font-size: 1.2em;">${finalScore}%</span>
                </div>
            </div>
        </div>
    `;

    return { html, finalScore, avg1D, avg3D, baseScore };
}
