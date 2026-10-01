// api/calibrate.js — Полный серверный модуль цветокоррекции ColorMatchPro

export default async function handler(req, res) {
    // 1. Настройка CORS для доступа с внешних клиентов
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { standard, sample } = req.body;

        if (!standard || !sample || !standard.target || !sample.target) {
            return res.status(400).json({ error: 'Некорректные входные данные: отсутствуют цветные метрики.' });
        }

        // --- ВСПОМОГАТЕЛЬНЫЕ МАТЕМАТИЧЕСКИЕ ФУНКЦИИ ---

        // Перевод 8-битного Lab (из OpenCV) в sRGB
        function labToRgb(l8, a8, b8) {
            const l = (l8 / 255) * 100;
            const a = a8 - 128;
            const b = b8 - 128;

            let y = (l + 16) / 116;
            let x = a / 500 + y;
            let z = y - b / 200;

            const x3 = Math.pow(x, 3);
            const y3 = Math.pow(y, 3);
            const z3 = Math.pow(z, 3);

            x = (x3 > 0.008856 ? x3 : (x - 16 / 116) / 7.787) * 0.95047;
            y = (y3 > 0.008856 ? y3 : (y - 16 / 116) / 7.787) * 1.00000;
            z = (z3 > 0.008856 ? z3 : (z - 16 / 116) / 7.787) * 1.08883;

            let r = x *  3.2406 + y * -1.5372 + z * -0.4986;
            let g = x * -0.9689 + y *  1.8758 + z *  0.0415;
            let b_rgb = x * 0.0557 + y * -0.2040 + z *  1.0570;

            r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
            g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
            b_rgb = b_rgb > 0.0031308 ? 1.055 * Math.pow(b_rgb, 1 / 2.4) - 0.055 : 12.92 * b_rgb;

            return {
                r: Math.max(0, Math.min(255, Math.round(r * 255))),
                g: Math.max(0, Math.min(255, Math.round(g * 255))),
                b: Math.max(0, Math.min(255, Math.round(b_rgb * 255)))
            };
        }

        // Расчет CIEDE2000 (ΔE00) между двумя цветами в формате CIE Lab
        function calcDeltaE2000(lab1, lab2) {
            const L1 = (lab1.L / 255) * 100, a1 = lab1.a - 128, b1 = lab1.b - 128;
            const L2 = (lab2.L / 255) * 100, a2 = lab2.a - 128, b2 = lab2.b - 128;

            const rad = Math.PI / 180;
            const C1 = Math.sqrt(a1 * a1 + b1 * b1);
            const C2 = Math.sqrt(a2 * a2 + b2 * b2);
            const C_bar = (C1 + C2) / 2;

            const G = 0.5 * (1 - Math.sqrt(Math.pow(C_bar, 7) / (Math.pow(C_bar, 7) + Math.pow(25, 7))));
            const a1_prime = (1 + G) * a1;
            const a2_prime = (1 + G) * a2;

            const C1_prime = Math.sqrt(a1_prime * a1_prime + b1 * b1);
            const C2_prime = Math.sqrt(a2_prime * a2_prime + b2 * b2);

            let h1_prime = Math.atan2(b1, a1_prime) * (180 / Math.PI);
            if (h1_prime < 0) h1_prime += 360;
            let h2_prime = Math.atan2(b2, a2_prime) * (180 / Math.PI);
            if (h2_prime < 0) h2_prime += 360;

            const delta_L_prime = L2 - L1;
            const delta_C_prime = C2_prime - C1_prime;

            let delta_h_prime = 0;
            if (C1_prime * C2_prime !== 0) {
                if (Math.abs(h2_prime - h1_prime) <= 180) {
                    delta_h_prime = h2_prime - h1_prime;
                } else if (h2_prime - h1_prime > 180) {
                    delta_h_prime = h2_prime - h1_prime - 360;
                } else {
                    delta_h_prime = h2_prime - h1_prime + 360;
                }
            }
            const delta_H_prime = 2 * Math.sqrt(C1_prime * C2_prime) * Math.sin((delta_h_prime / 2) * rad);

            const L_bar_prime = (L1 + L2) / 2;
            const C_bar_prime = (C1_prime + C2_prime) / 2;

            let h_bar_prime = h1_prime + h2_prime;
            if (C1_prime * C2_prime !== 0) {
                if (Math.abs(h1_prime - h2_prime) <= 180) {
                    h_bar_prime = (h1_prime + h2_prime) / 2;
                } else {
                    if (h1_prime + h2_prime < 360) {
                        h_bar_prime = (h1_prime + h2_prime + 360) / 2;
                    } else {
                        h_bar_prime = (h1_prime + h2_prime - 360) / 2;
                    }
                }
            }

            const T = 1 - 0.17 * Math.cos((h_bar_prime - 30) * rad) + 0.24 * Math.cos((2 * h_bar_prime) * rad) +
                      0.32 * Math.cos((3 * h_bar_prime + 6) * rad) - 0.20 * Math.cos((4 * h_bar_prime - 63) * rad);

            const SL = 1 + (0.015 * Math.pow(L_bar_prime - 50, 2)) / Math.sqrt(20 + Math.pow(L_bar_prime - 50, 2));
            const SC = 1 + 0.045 * C_bar_prime;
            const SH = 1 + 0.015 * C_bar_prime * T;

            const RT = -2 * Math.sqrt(Math.pow(C_bar_prime, 7) / (Math.pow(C_bar_prime, 7) + Math.pow(25, 7))) *
                       Math.sin((60 * Math.exp(-Math.pow((h_bar_prime - 275) / 25, 2))) * rad);

            return Math.sqrt(
                Math.pow(delta_L_prime / SL, 2) +
                Math.pow(delta_C_prime / SC, 2) +
                Math.pow(delta_H_prime / SH, 2) +
                RT * (delta_C_prime / SC) * (delta_H_prime / SH)
            );
        }

        // --- АЛГОРИТМЫ ЦВЕТОКОРРЕКЦИИ ---

        // 1D Линейная кусочная коррекция
        function apply1DLinear(stdPatches, samPatches, target) {
            const keys = ['black', 'gray', 'white'];
            const res = { L: target.L, a: target.a, b: target.b };

            ['L', 'a', 'b'].forEach(ch => {
                let pts = keys.map(k => ({ x: samPatches[k][ch], y: stdPatches[k][ch] }));
                pts.push({ x: 0, y: 0 }, { x: 255, y: 255 });
                pts.sort((p1, p2) => p1.x - p2.x);

                let v = target[ch];
                for (let i = 0; i < pts.length - 1; i++) {
                    if (v >= pts[i].x && v <= pts[i + 1].x) {
                        let span = pts[i + 1].x - pts[i].x;
                        let ratio = span === 0 ? 0 : (v - pts[i].x) / span;
                        res[ch] = pts[i].y + ratio * (pts[i + 1].y - pts[i].y);
                        break;
                    }
                }
            });
            return res;
        }

        // 3D Аффинная коррекция
        function apply3DAffine(stdPatches, samPatches, target) {
            const keys = Object.keys(stdPatches);
            const N = keys.length;
            let sumL = 0, sumA = 0, sumB = 0;
            let sumStdL = 0, sumStdA = 0, sumStdB = 0;

            keys.forEach(k => {
                sumL += samPatches[k].L;   sumStdL += stdPatches[k].L;
                sumA += samPatches[k].a;   sumStdA += stdPatches[k].a;
                sumB += samPatches[k].b;   sumStdB += stdPatches[k].b;
            });

            const gL = (sumStdL / N) / (sumL / N || 1);
            const gA = (sumStdA / N) / (sumA / N || 1);
            const gB = (sumStdB / N) / (sumB / N || 1);

            return {
                L: Math.max(0, Math.min(255, target.L * gL)),
                a: Math.max(0, Math.min(255, target.a * gA)),
                b: Math.max(0, Math.min(255, target.b * gB))
            };
        }

        // 3D IDW (Inverse Distance Weighting) Коррекция
        function apply3DIDW(stdPatches, samPatches, target) {
            const keys = Object.keys(stdPatches);
            let totalW = 0;
            let dL = 0, dA = 0, dB = 0;

            keys.forEach(k => {
                const dist = Math.sqrt(
                    Math.pow(target.L - samPatches[k].L, 2) +
                    Math.pow(target.a - samPatches[k].a, 2) +
                    Math.pow(target.b - samPatches[k].b, 2)
                );
                const w = 1 / (Math.pow(dist, 2) + 0.001);
                totalW += w;
                dL += w * (stdPatches[k].L - samPatches[k].L);
                dA += w * (stdPatches[k].a - samPatches[k].a);
                dB += w * (stdPatches[k].b - samPatches[k].b);
            });

            return {
                L: Math.max(0, Math.min(255, target.L + dL / totalW)),
                a: Math.max(0, Math.min(255, target.a + dA / totalW)),
                b: Math.max(0, Math.min(255, target.b + dB / totalW))
            };
        }

        // Главный расчётный контроллер для метода
        function computeScore(methodType, mode) {
            const stdT = standard.target[mode];
            const samT = sample.target[mode];
            let corrSamT;

            if (methodType === '3d_idw') {
                corrSamT = apply3DIDW(standard.patches, sample.patches, samT);
            } else if (methodType === '3d_affine') {
                corrSamT = apply3DAffine(standard.patches, sample.patches, samT);
            } else {
                corrSamT = apply1DLinear(standard.patches, sample.patches, samT);
            }

            const dE = calcDeltaE2000(stdT, corrSamT);
            const matchPct = Math.max(0, Math.min(100, Math.round(100 - (dE / 35) * 100)));

            return { dE: dE.toFixed(2), matchPct, corrSamT };
        }

        // --- СБОРКА АНСАМБЛЯ И ВЕРДИКТА ---
        const methods = [
            { name: '1D Кусочно-линейный (Mean)', ...computeScore('1d_linear', 'mean') },
            { name: '1D Кусочно-линейный (Median)', ...computeScore('1d_linear', 'median') },
            { name: '3D IDW Интерполяция (Mean)', ...computeScore('3d_idw', 'mean') },
            { name: '3D IDW Интерполяция (Median)', ...computeScore('3d_idw', 'median') },
            { name: '3D Аффинная Матрица (Mean)', ...computeScore('3d_affine', 'mean') }
        ];

        // Находим лучший результат
        methods.sort((a, b) => b.matchPct - a.matchPct);
        const best = methods[0];

        // Преобразование RGB для визуализации мини-плашек
        const stdRgb = labToRgb(standard.target.mean.L, standard.target.mean.a, standard.target.mean.b);
        const samRgb = labToRgb(sample.target.mean.L, sample.target.mean.a, sample.target.mean.b);
        const corrRgb = labToRgb(best.corrSamT.L, best.corrSamT.a, best.corrSamT.b);

        // Генерация итоговой HTML-карточки отчёта
        const htmlReport = `
            <div style="font-family: system-ui, sans-serif; background: #1e1e24; color: #fff; padding: 20px; border-radius: 12px; max-width: 500px; margin: 0 auto;">
                <h2 style="text-align: center; margin-top: 0; color: #4dabf7;">ColorMatchPro Result</h2>
                
                <div style="display: flex; justify-content: space-around; align-items: center; margin: 20px 0; text-align: center;">
                    <div>
                        <div style="width: 50px; height: 50px; border-radius: 50%; background: rgb(${stdRgb.r},${stdRgb.g},${stdRgb.b}); border: 2px solid #fff; margin: 0 auto;"></div>
                        <span style="font-size: 12px; color: #aaa;">Эталон</span>
                    </div>
                    <div>
                        <div style="width: 50px; height: 50px; border-radius: 50%; background: rgb(${samRgb.r},${samRgb.g},${samRgb.b}); border: 2px solid #888; margin: 0 auto;"></div>
                        <span style="font-size: 12px; color: #aaa;">Образец (сырой)</span>
                    </div>
                    <div>
                        <div style="width: 50px; height: 50px; border-radius: 50%; background: rgb(${corrRgb.r},${corrRgb.g},${corrRgb.b}); border: 2px solid #4caf50; margin: 0 auto;"></div>
                        <span style="font-size: 12px; color: #aaa;">Скорректирован</span>
                    </div>
                </div>

                <div style="background: #2b2b36; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 36px; font-weight: bold; color: ${best.matchPct > 85 ? '#4caf50' : '#ff9800'};">${best.matchPct}%</div>
                    <div style="font-size: 14px; color: #ccc;">СОВПАДЕНИЕ (ΔE = ${best.dE})</div>
                    <div style="font-size: 11px; color: #888; margin-top: 5px;">Метод: ${best.name}</div>
                </div>

                <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: #ccc;">
                    <thead>
                        <tr style="border-bottom: 1px solid #444; text-align: left;">
                            <th style="padding: 6px;">Метод</th>
                            <th style="padding: 6px; text-align: right;">ΔE</th>
                            <th style="padding: 6px; text-align: right;">Match %</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${methods.map(m => `
                            <tr style="border-bottom: 1px solid #333;">
                                <td style="padding: 6px;">${m.name}</td>
                                <td style="padding: 6px; text-align: right;">${m.dE}</td>
                                <td style="padding: 6px; text-align: right; font-weight: bold; color: ${m.matchPct > 85 ? '#4caf50' : '#aaa'};">${m.matchPct}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        return res.status(200).json({
            success: true,
            bestMatchPct: best.matchPct,
            bestDeltaE: best.dE,
            htmlReport: htmlReport
        });

    } catch (err) {
        return res.status(500).json({ error: 'Серверная ошибка расчёта', details: err.message });
    }
}
