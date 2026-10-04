import { getResult } from './getResult.js';

// Вспомогательная функция для безопасного получения данных плашки (с поддержкой алиасов)
function getPatch(patches, key) {
    if (!patches) return null;
    if (patches[key]) return patches[key];
    const aliases = {
        'right1': 'cyan',
        'right2': 'magenta',
        'right3': 'yellow',
        'cyan': 'right1',
        'magenta': 'right2',
        'yellow': 'right3'
    };
    if (aliases[key] && patches[aliases[key]]) return patches[aliases[key]];
    return null;
}

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

// Вспомогательный линейный solver для систем уравнений
function solveLinearSystem(A, b) {
    let n = b.length;
    let aug = A.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
        }
        let tmp = aug[i]; aug[i] = aug[maxRow]; aug[maxRow] = tmp;

        if (Math.abs(aug[i][i]) < 1e-12) return null;

        let pivot = aug[i][i];
        for (let j = i; j <= n; j++) aug[i][j] /= pivot;

        for (let k = 0; k < n; k++) {
            if (k !== i) {
                let factor = aug[k][i];
                for (let j = i; j <= n; j++) {
                    aug[k][j] -= factor * aug[i][j];
                }
            }
        }
    }
    return aug.map(row => row[n]);
}

function applyGainOffsetCorrection(rawTarget, patches) {
    const IDEAL = {
        white: { l: 255, a: 128, b: 128 },
        black: { l: 20,  a: 128, b: 128 }
    };

    const pWhite = getPatch(patches, 'white') || IDEAL.white;
    const pBlack = getPatch(patches, 'black') || IDEAL.black;

    function corrChannel(val, ch) {
        let wIn = pWhite[ch], bIn = pBlack[ch];
        let wOut = IDEAL.white[ch], bOut = IDEAL.black[ch];
        let denom = (wIn - bIn) || 1;
        let res = bOut + (val - bIn) * (wOut - bOut) / denom;
        return Math.max(0, Math.min(255, Math.round(res)));
    }

    return {
        l: corrChannel(rawTarget.l, 'l'),
        a: corrChannel(rawTarget.a, 'a'),
        b: corrChannel(rawTarget.b, 'b')
    };
}

function applyLinearCorrection(rawTarget, patches) {
    const IDEAL = {
        white: { l: 255, a: 128, b: 128 },
        gray:  { l: 128, a: 128, b: 128 },
        black: { l: 20,  a: 128, b: 128 }
    };

    const pWhite = getPatch(patches, 'white') || IDEAL.white;
    const pGray  = getPatch(patches, 'gray')  || IDEAL.gray;
    const pBlack = getPatch(patches, 'black') || IDEAL.black;

    function interpolateChannel(val, ch) {
        let pts = [
            { x: 0, y: 0 },
            { x: pBlack[ch], y: IDEAL.black[ch] },
            { x: pGray[ch],  y: IDEAL.gray[ch] },
            { x: pWhite[ch], y: IDEAL.white[ch] },
            { x: 255, y: 255 }
        ];

        pts.sort((a, b) => a.x - b.x);

        let clean = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            if (pts[i].x > clean[clean.length - 1].x) {
                clean.push(pts[i]);
            }
        }

        if (val < clean[0].x) {
            if (clean[0].x === 0) return 0;
            let slope = clean[0].y / clean[0].x;
            return Math.max(0, Math.min(255, Math.round(val * slope)));
        }

        let last = clean[clean.length - 1];
        if (val > last.x) {
            if (last.x === 255) return 255;
            let slope = (255 - last.y) / (255 - last.x);
            return Math.max(0, Math.min(255, Math.round(last.y + (val - last.x) * slope)));
        }

        for (let i = 0; i < clean.length - 1; i++) {
            let p1 = clean[i], p2 = clean[i + 1];
            if (val >= p1.x && val <= p2.x) {
                let ratio = (val - p1.x) / (p2.x - p1.x);
                let interpolated = p1.y + ratio * (p2.y - p1.y);
                return Math.max(0, Math.min(255, Math.round(interpolated)));
            }
        }

        return Math.max(0, Math.min(255, Math.round(val)));
    }

    return {
        l: interpolateChannel(rawTarget.l, 'l'),
        a: interpolateChannel(rawTarget.a, 'a'),
        b: interpolateChannel(rawTarget.b, 'b')
    };
}

function applySplineCorrection(rawTarget, patches) {
    const IDEAL = {
        white: { l: 255, a: 128, b: 128 },
        gray:  { l: 128, a: 128, b: 128 },
        black: { l: 20,  a: 128, b: 128 }
    };

    const pWhite = getPatch(patches, 'white') || IDEAL.white;
    const pGray  = getPatch(patches, 'gray')  || IDEAL.gray;
    const pBlack = getPatch(patches, 'black') || IDEAL.black;

    function monotonicSpline(val, ch) {
        let pts = [
            { x: 0, y: 0 },
            { x: pBlack[ch], y: IDEAL.black[ch] },
            { x: pGray[ch],  y: IDEAL.gray[ch] },
            { x: pWhite[ch], y: IDEAL.white[ch] },
            { x: 255, y: 255 }
        ];

        pts.sort((a, b) => a.x - b.x);

        let clean = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            if (pts[i].x > clean[clean.length - 1].x) {
                clean.push(pts[i]);
            }
        }

        if (clean.length < 2) return val;

        if (val <= clean[0].x) return Math.max(0, Math.min(255, Math.round(clean[0].y * (val / Math.max(1, clean[0].x)))));
        let last = clean[clean.length - 1];
        if (val >= last.x) return Math.max(0, Math.min(255, Math.round(last.y + (255 - last.y) * ((val - last.x) / Math.max(1, 255 - last.x)))));

        for (let i = 0; i < clean.length - 1; i++) {
            let p1 = clean[i], p2 = clean[i + 1];
            if (val >= p1.x && val <= p2.x) {
                let t = (val - p1.x) / (p2.x - p1.x);
                let smoothT = t * t * (3 - 2 * t);
                let interpolated = p1.y + smoothT * (p2.y - p1.y);
                return Math.max(0, Math.min(255, Math.round(interpolated)));
            }
        }

        return val;
    }

    return {
        l: monotonicSpline(rawTarget.l, 'l'),
        a: monotonicSpline(rawTarget.a, 'a'),
        b: monotonicSpline(rawTarget.b, 'b')
    };
}

function apply3DIDWCorrection(rawTarget, patches) {
    const IDEAL = {
        white:  { l: 255, a: 128, b: 128 },
        gray:   { l: 128, a: 128, b: 128 },
        black:  { l: 20,  a: 128, b: 128 },
        right1: { l: 232, a: 74,  b: 104 },
        right2: { l: 123, a: 216, b: 102 },
        right3: { l: 247, a: 110, b: 226 }
    };

    const keys = ['white', 'gray', 'black', 'right1', 'right2', 'right3'];
    let sumW = 0, sumDL = 0, sumDA = 0, sumDB = 0;

    for (let k of keys) {
        let p = getPatch(patches, k);
        if (!p) continue;
        let target = IDEAL[k];
        let dist = Math.sqrt((rawTarget.l - p.l)**2 + (rawTarget.a - p.a)**2 + (rawTarget.b - p.b)**2);
        let w = 1.0 / (Math.pow(dist, 2) + 1e-4);
        
        sumW += w;
        sumDL += w * (target.l - p.l);
        sumDA += w * (target.a - p.a);
        sumDB += w * (target.b - p.b);
    }

    if (sumW === 0) return rawTarget;

    let resL = rawTarget.l + sumDL / sumW;
    let resA = rawTarget.a + sumDA / sumW;
    let resB = rawTarget.b + sumDB / sumW;

    return {
        l: Math.max(0, Math.min(255, Math.round(resL))),
        a: Math.max(0, Math.min(255, Math.round(resA))),
        b: Math.max(0, Math.min(255, Math.round(resB)))
    };
}

function apply3DAffineCorrection(rawTarget, patches) {
    const IDEAL = {
        white:  { l: 255, a: 128, b: 128 },
        gray:   { l: 128, a: 128, b: 128 },
        black:  { l: 20,  a: 128, b: 128 },
        right1: { l: 232, a: 74,  b: 104 },
        right2: { l: 123, a: 216, b: 102 },
        right3: { l: 247, a: 110, b: 226 }
    };

    const keys = ['white', 'gray', 'black', 'right1', 'right2', 'right3'];
    let validKeys = keys.filter(k => getPatch(patches, k) !== null);
    if (validKeys.length < 4) return rawTarget;

    let A = validKeys.map(k => {
        let p = getPatch(patches, k);
        return [p.l, p.a, p.b, 1];
    });
    
    let AtA = Array(4).fill(0).map(() => Array(4).fill(0));
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            let sum = 0;
            for (let i = 0; i < validKeys.length; i++) {
                sum += A[i][r] * A[i][c];
            }
            AtA[r][c] = sum;
        }
    }

    function solveChannel(ch) {
        let AtB = Array(4).fill(0);
        for (let r = 0; r < 4; r++) {
            let sum = 0;
            for (let i = 0; i < validKeys.length; i++) {
                sum += A[i][r] * IDEAL[validKeys[i]][ch];
            }
            AtB[r] = sum;
        }
        let coeff = solveLinearSystem(AtA, AtB);
        if (!coeff) return rawTarget[ch];
        let val = coeff[0] * rawTarget.l + coeff[1] * rawTarget.a + coeff[2] * rawTarget.b + coeff[3];
        return Math.max(0, Math.min(255, Math.round(val)));
    }

    return {
        l: solveChannel('l'),
        a: solveChannel('a'),
        b: solveChannel('b')
    };
}

function apply3DTPSCorrection(rawTarget, patches) {
    const IDEAL = {
        white:  { l: 255, a: 128, b: 128 },
        gray:   { l: 128, a: 128, b: 128 },
        black:  { l: 20,  a: 128, b: 128 },
        right1: { l: 232, a: 74,  b: 104 },
        right2: { l: 123, a: 216, b: 102 },
        right3: { l: 247, a: 110, b: 226 }
    };

    const keys = ['white', 'gray', 'black', 'right1', 'right2', 'right3'];
    let validKeys = keys.filter(k => getPatch(patches, k) !== null);
    const N = validKeys.length;
    if (N < 4) return rawTarget;

    let pts = validKeys.map(k => getPatch(patches, k));
    let M = Array(N + 4).fill(0).map(() => Array(N + 4).fill(0));

    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            let dist = Math.sqrt((pts[i].l - pts[j].l)**2 + (pts[i].a - pts[j].a)**2 + (pts[i].b - pts[j].b)**2);
            M[i][j] = dist;
        }
        M[i][N] = 1;
        M[i][N + 1] = pts[i].l;
        M[i][N + 2] = pts[i].a;
        M[i][N + 3] = pts[i].b;

        M[N][i] = 1;
        M[N + 1][i] = pts[i].l;
        M[N + 2][i] = pts[i].a;
        M[N + 3][i] = pts[i].b;
    }

    function solveChannel(ch) {
        let B = Array(N + 4).fill(0);
        for (let i = 0; i < N; i++) {
            B[i] = IDEAL[validKeys[i]][ch];
        }

        let sol = solveLinearSystem(M, B);
        if (!sol) return apply3DIDWCorrection(rawTarget, patches)[ch];

        let val = sol[N] + sol[N + 1] * rawTarget.l + sol[N + 2] * rawTarget.a + sol[N + 3] * rawTarget.b;
        for (let i = 0; i < N; i++) {
            let dist = Math.sqrt((rawTarget.l - pts[i].l)**2 + (rawTarget.a - pts[i].a)**2 + (rawTarget.b - pts[i].b)**2);
            val += sol[i] * dist;
        }

        return Math.max(0, Math.min(255, Math.round(val)));
    }

    return {
        l: solveChannel('l'),
        a: solveChannel('a'),
        b: solveChannel('b')
    };
}

// 3D Матрица 3x3 (без сдвига)
function apply3DMatrix3x3Correction(rawTarget, patches) {
    const IDEAL = {
        white:  { l: 255, a: 128, b: 128 },
        gray:   { l: 128, a: 128, b: 128 },
        black:  { l: 20,  a: 128, b: 128 },
        right1: { l: 232, a: 74,  b: 104 },
        right2: { l: 123, a: 216, b: 102 },
        right3: { l: 247, a: 110, b: 226 }
    };

    const keys = ['white', 'gray', 'black', 'right1', 'right2', 'right3'];
    let validKeys = keys.filter(k => getPatch(patches, k) !== null);
    if (validKeys.length < 3) return rawTarget;

    let A = validKeys.map(k => {
        let p = getPatch(patches, k);
        return [p.l, p.a, p.b];
    });

    let AtA = Array(3).fill(0).map(() => Array(3).fill(0));
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            let sum = 0;
            for (let i = 0; i < validKeys.length; i++) {
                sum += A[i][r] * A[i][c];
            }
            AtA[r][c] = sum;
        }
    }

    function solveChannel(ch) {
        let AtB = Array(3).fill(0);
        for (let r = 0; r < 3; r++) {
            let sum = 0;
            for (let i = 0; i < validKeys.length; i++) {
                sum += A[i][r] * IDEAL[validKeys[i]][ch];
            }
            AtB[r] = sum;
        }
        let coeff = solveLinearSystem(AtA, AtB);
        if (!coeff) return rawTarget[ch];
        let val = coeff[0] * rawTarget.l + coeff[1] * rawTarget.a + coeff[2] * rawTarget.b;
        return Math.max(0, Math.min(255, Math.round(val)));
    }

    return {
        l: solveChannel('l'),
        a: solveChannel('a'),
        b: solveChannel('b')
    };
}

// 3D Полиномиальная модель 2-го порядка
function apply3DPoly2Correction(rawTarget, patches) {
    const IDEAL = {
        white:  { l: 255, a: 128, b: 128 },
        gray:   { l: 128, a: 128, b: 128 },
        black:  { l: 20,  a: 128, b: 128 },
        right1: { l: 232, a: 74,  b: 104 },
        right2: { l: 123, a: 216, b: 102 },
        right3: { l: 247, a: 110, b: 226 }
    };

    const keys = ['white', 'gray', 'black', 'right1', 'right2', 'right3'];
    let validKeys = keys.filter(k => getPatch(patches, k) !== null);
    if (validKeys.length < 6) return apply3DAffineCorrection(rawTarget, patches);

    let A = validKeys.map(k => {
        let p = getPatch(patches, k);
        return [p.l, p.a, p.b, (p.l**2)/255, (p.a**2)/255, (p.b**2)/255];
    });

    let AtA = Array(6).fill(0).map(() => Array(6).fill(0));
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
            let sum = 0;
            for (let i = 0; i < validKeys.length; i++) {
                sum += A[i][r] * A[i][c];
            }
            AtA[r][c] = sum + (r === c ? 1e-4 : 0);
        }
    }

    function solveChannel(ch) {
        let AtB = Array(6).fill(0);
        for (let r = 0; r < 6; r++) {
            let sum = 0;
            for (let i = 0; i < validKeys.length; i++) {
                sum += A[i][r] * IDEAL[validKeys[i]][ch];
            }
            AtB[r] = sum;
        }
        let coeff = solveLinearSystem(AtA, AtB);
        if (!coeff) return rawTarget[ch];
        let val = coeff[0] * rawTarget.l + coeff[1] * rawTarget.a + coeff[2] * rawTarget.b +
                  coeff[3] * (rawTarget.l**2)/255 + coeff[4] * (rawTarget.a**2)/255 + coeff[5] * (rawTarget.b**2)/255;
        return Math.max(0, Math.min(255, Math.round(val)));
    }

    return {
        l: solveChannel('l'),
        a: solveChannel('a'),
        b: solveChannel('b')
    };
}

// 3D RBF (Радиально-базисная функция)
function apply3DRBFCorrection(rawTarget, patches) {
    const IDEAL = {
        white:  { l: 255, a: 128, b: 128 },
        gray:   { l: 128, a: 128, b: 128 },
        black:  { l: 20,  a: 128, b: 128 },
        right1: { l: 232, a: 74,  b: 104 },
        right2: { l: 123, a: 216, b: 102 },
        right3: { l: 247, a: 110, b: 226 }
    };

    const keys = ['white', 'gray', 'black', 'right1', 'right2', 'right3'];
    let validKeys = keys.filter(k => getPatch(patches, k) !== null);
    const N = validKeys.length;
    if (N < 3) return rawTarget;

    let pts = validKeys.map(k => getPatch(patches, k));
    const sigma = 100;

    let K = Array(N).fill(0).map(() => Array(N).fill(0));
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            let distSq = (pts[i].l - pts[j].l)**2 + (pts[i].a - pts[j].a)**2 + (pts[i].b - pts[j].b)**2;
            K[i][j] = Math.exp(-distSq / (2 * sigma * sigma)) + (i === j ? 1e-4 : 0);
        }
    }

    function solveChannel(ch) {
        let B = validKeys.map(k => IDEAL[k][ch]);
        let w = solveLinearSystem(K, B);
        if (!w) return apply3DIDWCorrection(rawTarget, patches)[ch];

        let val = 0;
        for (let i = 0; i < N; i++) {
            let distSq = (rawTarget.l - pts[i].l)**2 + (rawTarget.a - pts[i].a)**2 + (rawTarget.b - pts[i].b)**2;
            val += w[i] * Math.exp(-distSq / (2 * sigma * sigma));
        }
        return Math.max(0, Math.min(255, Math.round(val)));
    }

    return {
        l: solveChannel('l'),
        a: solveChannel('a'),
        b: solveChannel('b')
    };
}

// Перевод процента/Delta E в один из 4 вердиктов
function getStatusBadge(diff, percent) {
    const score = percent !== undefined ? percent : deltaEToPercent(diff);

    if (score >= 93) {
        return { class: 'match-success', text: 'ТОТ САМЫЙ ЦВЕТ' };
    }
    if (score >= 83) {
        return { class: 'match-warning', text: 'ПОЧТИ ТОТ' };
    }
    if (score >= 67) {
        return { class: 'match-orange', text: 'ПОХОЖ, НО РАЗЛИЧАЕТСЯ' };
    }
    return { class: 'match-error', text: 'НЕ ТОТ ЦВЕТ' };
}

// Перевод Delta E в процент совпадения на основе восприятия человеком
function deltaEToPercent(diff) {
    if (diff <= 0) return 100;
    const score = 100 * Math.exp(-0.04 * diff);
    return Math.max(0, Math.min(100, Math.round(score)));
}

function computeRawScore(stdRaw, smpRaw, statType) {
    const stdColor = statType === 'mean' ? stdRaw.mainMean : (stdRaw.mainMedian || stdRaw.mainMean);
    const smpColor = statType === 'mean' ? smpRaw.mainMean : (smpRaw.mainMedian || smpRaw.mainMean);

    const diff = Math.round(Math.sqrt(
        Math.pow(stdColor.l - smpColor.l, 2) + 
        Math.pow(stdColor.a - smpColor.a, 2) + 
        Math.pow(stdColor.b - smpColor.b, 2)
    ));
    
    // Применение нелинейной шкалы строго для сырых данных
    const percent = deltaEToPercent(diff);
    const status = getStatusBadge(diff, percent);

    return { stdColor, smpColor, diff, percent, status };
}

function computeMethodScore(stdRaw, smpRaw, mathMethod, statType) {
    const rawTargetStd = statType === 'mean' ? stdRaw.mainMean : (stdRaw.mainMedian || stdRaw.mainMean);
    const rawTargetSmp = statType === 'mean' ? smpRaw.mainMean : (smpRaw.mainMedian || smpRaw.mainMean);
    
    const patchesDataStd = statType === 'mean' ? stdRaw.patchesMean : (stdRaw.patchesMedian || stdRaw.patchesMean);
    const patchesDataSmp = statType === 'mean' ? smpRaw.patchesMedian || smpRaw.patchesMean : (smpRaw.patchesMedian || smpRaw.patchesMean);

    let corrector;
    if (mathMethod === 'gain_offset') corrector = applyGainOffsetCorrection;
    else if (mathMethod === 'linear') corrector = applyLinearCorrection;
    else if (mathMethod === 'spline') corrector = applySplineCorrection;
    else if (mathMethod === '3d_idw') corrector = apply3DIDWCorrection;
    else if (mathMethod === '3d_affine') corrector = apply3DAffineCorrection;
    else if (mathMethod === '3d_tps') corrector = apply3DTPSCorrection;
    else if (mathMethod === '3d_matrix3x3') corrector = apply3DMatrix3x3Correction;
    else if (mathMethod === '3d_poly2') corrector = apply3DPoly2Correction;
    else if (mathMethod === '3d_rbf') corrector = apply3DRBFCorrection;
    else corrector = applyLinearCorrection;

    const stdCorr = corrector(rawTargetStd, patchesDataStd);
    const smpCorr = corrector(rawTargetSmp, patchesDataSmp);

    const diff = Math.round(Math.sqrt(
        Math.pow(stdCorr.l - smpCorr.l, 2) + 
        Math.pow(stdCorr.a - smpCorr.a, 2) + 
        Math.pow(stdCorr.b - smpCorr.b, 2)
    ));

    const percent = deltaEToPercent(diff);
    const status = getStatusBadge(diff, percent);

    return { stdCorr, smpCorr, diff, percent, status };
}

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { standard, sample } = req.body;

    if (!standard || !sample) {
        return res.status(400).json({ error: 'Missing standard or sample data' });
    }

    // 1. Сбор чистых результатов
    const rawMean = computeRawScore(standard, sample, 'mean');
    const rawMedian = computeRawScore(standard, sample, 'median');

    const m1D_1 = computeMethodScore(standard, sample, 'gain_offset', 'mean');
    const m1D_2 = computeMethodScore(standard, sample, 'linear', 'mean');
    const m1D_3 = computeMethodScore(standard, sample, 'linear', 'median');
    const m1D_4 = computeMethodScore(standard, sample, 'spline', 'mean');
    const m1D_5 = computeMethodScore(standard, sample, 'spline', 'median');

    const m3D_1 = computeMethodScore(standard, sample, '3d_idw', 'mean');
    const m3D_2 = computeMethodScore(standard, sample, '3d_affine', 'mean');
    const m3D_3 = computeMethodScore(standard, sample, '3d_affine', 'median');
    const m3D_4 = computeMethodScore(standard, sample, '3d_tps', 'mean');
    const m3D_5 = computeMethodScore(standard, sample, '3d_tps', 'median');

    // Дополнительные методы 3D для просмотра в Pro режиме
    const m3D_6 = computeMethodScore(standard, sample, '3d_matrix3x3', 'mean');
    const m3D_7 = computeMethodScore(standard, sample, '3d_poly2', 'mean');
    const m3D_8 = computeMethodScore(standard, sample, '3d_rbf', 'mean');

    // 2. Передача чистых данных в отдельный файл вердикта
    const resultData = getResult({
        rawMean, rawMedian,
        m1D_1, m1D_2, m1D_3, m1D_4, m1D_5,
        m3D_1, m3D_2, m3D_3, m3D_4, m3D_5,
        m3D_6, m3D_7, m3D_8
    });

    return res.status(200).json({ html: resultData.html });
}
