export function getResult({
    rawMean, rawMedian,
    m1D_1, m1D_2, m1D_3, m1D_4, m1D_5,
    m3D_1, m3D_2, m3D_3, m3D_4, m3D_5,
    m3D_6, m3D_7, m3D_8
}) {
    const m1D_list = [m1D_1, m1D_2, m1D_3, m1D_4, m1D_5].filter(Boolean);
    const m3D_list = [m3D_1, m3D_2, m3D_3, m3D_4, m3D_5, m3D_6, m3D_7, m3D_8].filter(Boolean);

    const avg1D = m1D_list.length 
        ? (m1D_list.reduce((sum, item) => sum + item.percent, 0) / m1D_list.length).toFixed(1)
        : 0;

    const avg3D = m3D_list.length 
        ? (m3D_list.reduce((sum, item) => sum + item.percent, 0) / m3D_list.length).toFixed(1)
        : 0;

    const overallConsensus = ((parseFloat(avg1D) + parseFloat(avg3D)) / 2).toFixed(1);

    function renderMethodRow(label, methodData) {
        if (!methodData) return '';
        const { percent, diff, status } = methodData;
        return `
            <div class="method-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;">
                <div>
                    <div style="font-weight: bold; color: #fff; font-size: 13px;">${label}</div>
                    <div style="font-size: 11px; color: #888; margin-top: 2px;">
                        <span class="${status.class}" style="font-weight: bold;">${status.text}</span> • ΔE = ${diff}
                    </div>
                </div>
                <div style="font-size: 18px; font-weight: bold; color: #fff;">
                    <span class="status-dots ${status.class}"></span> ${percent}%
                </div>
            </div>
        `;
    }

    const html = `
        <!-- Блок 1D коррекции -->
        <div class="card" style="margin-bottom: 16px;">
            <div class="card-title" style="margin-bottom: 12px; font-weight: bold; color: #00f0ff;">📊 СРАВНЕНИЕ МЕТОДОВ 1D КОРРЕКЦИИ</div>
            ${renderMethodRow('1D Gain + Offset (Черный/Белый)', m1D_1)}
            ${renderMethodRow('1D Линейное + Среднее', m1D_2)}
            ${renderMethodRow('1D Линейное + Медианное', m1D_3)}
            ${renderMethodRow('1D Сплайновое + Среднее', m1D_4)}
            ${renderMethodRow('1D Сплайновое + Медианное', m1D_5)}
        </div>

        <!-- Блок 3D коррекции -->
        <div class="card" style="margin-bottom: 16px;">
            <div class="card-title" style="margin-bottom: 12px; font-weight: bold; color: #b084ff;">🔮 СРАВНЕНИЕ МЕТОДОВ 3D КОРРЕКЦИИ</div>
            ${renderMethodRow('3D IDW (Инверсно-взвешенное)', m3D_1)}
            ${renderMethodRow('3D Аффинное + Среднее', m3D_2)}
            ${renderMethodRow('3D Аффинное + Медианное', m3D_3)}
            ${renderMethodRow('3D TPS Сплайн + Среднее', m3D_4)}
            ${renderMethodRow('3D TPS Сплайн + Медианное', m3D_5)}
            ${renderMethodRow('3D Матрица 3x3 + Среднее', m3D_6)}
            ${renderMethodRow('3D Модель 2-го порядка (Poly2)', m3D_7)}
            ${renderMethodRow('3D RBF (Радиально-базисная)', m3D_8)}
        </div>

        <!-- Итоговый вердикт -->
        <div class="card">
            <div class="card-title" style="margin-bottom: 12px; font-weight: bold; color: #00ff88;">🏆 ИТОГОВЫЙ ВЕРДИКТ С УЧЁТОМ КОНСЕНСУСА</div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span>Среднее 1D методов (${m1D_list.length} методов):</span>
                <strong style="color: #00ff88; font-size: 18px;">${avg1D}%</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span>Среднее 3D методов (${m3D_list.length} методов):</span>
                <strong style="color: #00ff88; font-size: 18px;">${avg3D}%</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
                <span>Базовый консенсус (1D + 3D):</span>
                <strong style="color: #00ff88; font-size: 20px;">${overallConsensus}%</strong>
            </div>
        </div>
    `;

    return { html, avg1D, avg3D, overallConsensus };
}
