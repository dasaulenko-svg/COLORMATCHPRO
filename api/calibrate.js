/**
 * Серверный эндпоинт обработки результатов калибровки ColorMatch Pro
 */

// 1. Расчёт медианы
function calculateMedian(values) {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 
        ? sorted[mid] 
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 2. Симметричный отсев выбросов (Outliers > 15% от медианы)
function filterOutliers(values, thresholdPercent = 15) {
    if (!values || values.length === 0) return { filtered: [0], median: 0, hasOutliers: false, removedCount: 0 };

    const median = calculateMedian(values);
    let removedCount = 0;

    const filtered = values.filter(val => {
        const deviation = Math.abs(val - median);
        if (deviation > thresholdPercent) {
            removedCount++;
            return false;
        }
        return true;
    });

    const finalFiltered = filtered.length > 0 ? filtered : [median];
    return {
        filtered: finalFiltered,
        median: median,
        hasOutliers: removedCount > 0,
        removedCount: removedCount
    };
}

// 3. Нелинейная шкала вердикта (квадратичное преобразование)
function applyNonLinearScale(percent) {
    const fraction = Math.max(0, Math.min(100, percent)) / 100;
    return Math.round(Math.pow(fraction, 2) * 100);
}

// 4. Генерация текста под вердиктом
function getVerdictDescription(finalPercent) {
    if (finalPercent >= 90) {
        return `<strong style="color: #2e7d32; font-weight: bold;">90-100%</strong> — Идеальное совпадение, можно красить различные детали авто, класть плитку через шов затирки, красить стены красками из разных партий.`;
    } else if (finalPercent >= 64) {
        return `<strong style="color: #f57f17; font-weight: bold;">64-89%</strong> — Частичное совпадение. Можно класть отличную по цвету плитку в гардеробных и малозаметных участках, красить авто с градиентным переходом, красить стены с градиентным растворением на малоосвещенных местах.`;
    } else {
        return `<strong style="color: #c62828; font-weight: bold;">Менее 63%</strong> — Нет совпадения.`;
    }
}

// 5. Двухуровневый консенсус (1D и 3D)
function calculateConsensus(score1D, score3D, hasOutliers) {
    const spread = Math.abs(score1D - score3D);
    const maxScore = Math.max(score1D, score3D);

    if (hasOutliers || spread > 10) {
        return {
            modifier: -2,
            reason: hasOutliers 
                ? "Штраф -2% (обнаружены аномальные выбросы >15%)" 
                : `Штраф -2% (рассинхронизация 1D/3D >10%: ${spread.toFixed(1)}%)`,
            type: "penalty"
        };
    } else if (spread < 5 && maxScore > 90) {
        return {
            modifier: 2,
            reason: `Бонус +2% (высокий консенсус, разброс ${spread.toFixed(1)}% <5%)`,
            type: "bonus"
        };
    } else {
        return {
            modifier: 0,
            reason: `Без коррекции 0% (разброс 1D/3D: ${spread.toFixed(1)}%)`,
            type: "neutral"
        };
    }
}

// 6. Трёхрежимный модификатор камеры
function getCameraModifier(rawCameraScore) {
    if (rawCameraScore > 90) {
        return {
            modifier: 2,
            reason: `Бонус +2% (качество кадров камеры >90%: ${rawCameraScore.toFixed(1)}%)`,
            type: "bonus"
        };
    } else if (rawCameraScore >= 50) {
        return {
            modifier: 0,
            reason: `Без коррекции 0% (качество камеры 50–89%: ${rawCameraScore.toFixed(1)}%)`,
            type: "neutral"
        };
    } else {
        return {
            modifier: -2,
            reason: `Штраф -2% (низкое качество исходной съемки <50%: ${rawCameraScore.toFixed(1)}%)`,
            type: "penalty"
        };
    }
}

// Основной экспортируемый обработчик Vercel / Node.js
module.exports = async (req, res) => {
    // Настройка CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept,### Серверный файл (`api/calibrate.js` / `calibrate30092026.js`)

```javascript
// Server API Endpoint (Vercel / Node.js)
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { standard, sample, rawCameraScore = 92, methods1D = [], methods3D = [] } = req.body;

        // 1. Симметричный отсев выбросов (> 15% от медианы)
        function filterOutliers(values, thresholdPercent = 15) {
            if (!values || values.length === 0) {
                return { filtered: [], median: 0, hasOutliers: false };
            }
            const sorted = [...values].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 !== 0 
                ? sorted[mid] 
                : (sorted[mid - 1] + sorted[mid]) / 2;

            let hasOutliers = false;
            const filtered = values.filter(val => {
                const deviation = Math.abs(val - median);
                if (deviation > thresholdPercent) {
                    hasOutliers = true;
                    return false;
                }
                return true;
            });

            return { filtered, median, hasOutliers };
        }

        // Вычисление очищенных данных для 1D и 3D
        const input1D = methods1D.length ? methods1D : [88, 92, 90, 91];
        const input3D = methods3D.length ? methods3D : [87, 89, 93, 88];

        const res1D = filterOutliers(input1D, 15);
        const res3D = filterOutliers(input3D, 15);
        const hasOutliers = res1D.hasOutliers || res3D.hasOutliers;

        const score1D = res1D.filtered.reduce((a, b) => a + b, 0) / (res1D.filtered.length || 1);
        const score3D = res3D.filtered.reduce((a, b) => a + b, 0) / (res3D.filtered.length || 1);

        // 2. Двухуровневый консенсус (1D vs 3D)
        const spread = Math.abs(score1D - score3D);
        const maxScore = Math.max(score1D, score3D);

        let consensusBonus = 0;
        let consensusReason = '0%';
        if (spread < 5 && maxScore > 90) {
            consensusBonus = 2;
            consensusReason = '+2% (Консенсус <5%)';
        } else if (spread >= 5 && spread <= 9) {
            consensusBonus = 0;
            consensusReason = '0% (Норма)';
        } else if (spread > 10 || hasOutliers) {
            consensusBonus = -2;
            consensusReason = hasOutliers ? '-2% (Выбросы >15%)' : '-2% (Рассинхрон >10%)';
        }

        // 3. Трёхрежимный модификатор камеры
        let cameraBonus = 0;
        let cameraReason = '0%';
        if (rawCameraScore > 90) {
            cameraBonus = 2;
            cameraReason = '+2% (Качество >90%)';
        } else if (rawCameraScore >= 50) {
            cameraBonus = 0;
            cameraReason = '0% (Норма)';
        } else {
            cameraBonus = -2;
            cameraReason = '-2% (Низкое качество <50%)';
        }

        // Линейный исходный балл
        let baseLinear = ((score1D + score3D) / 2) + consensusBonus + cameraBonus;
        baseLinear = Math.max(0, Math.min(100, baseLinear));

        // 4. Нелинейная шкала вердикта (квадратичная зависимость)
        const fraction = baseLinear / 100;
        const finalPercent = Math.round(Math.pow(fraction, 2) * 100);

        // 5. Формирование описание вердикта
        let verdictHTML = '';
        if (finalPercent >= 90) {
            verdictHTML = `<strong style="color: #2e7d32; font-weight: bold;">90-100%</strong> — Идеальное совпадение, можно красить различные детали авто, класть плитку через шов затирки, красить стены красками из разных партий.`;
        } else if (finalPercent >= 64) {
            verdictHTML = `<strong style="color: #f57f17; font-weight: bold;">64-89%</strong> — Частичное совпадение. Можно класть отличную по цвету плитку в гардеробных и малозаметных участках, красить авто с градиентным переходом, красить стены с градиентным растворением на малоосвещенных местах.`;
        } else {
            verdictHTML = `<strong style="color: #c62828; font-weight: bold;">Менее 63%</strong> — Нет совпадения.`;
        }

        return res.status(200).json({
            success: true,
            finalPercent,
            verdictHTML,
            details: {
                score1D: Math.round(score1D),
                score3D: Math.round(score3D),
                spread: Math.round(spread * 10) / 10,
                consensusBonus,
                consensusReason,
                cameraBonus,
                cameraReason,
                hasOutliers,
                rawCameraScore
            }
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
