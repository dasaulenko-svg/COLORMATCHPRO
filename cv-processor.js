// Конвертация LAB в RGB для превью плашек
function labToRgb(l, a, b) {
    let labMat = cv.matFromArray(1, 1, cv.CV_8UC3, [l, a, b]);
    let rgbMat = new cv.Mat();
    cv.cvtColor(labMat, rgbMat, cv.COLOR_Lab2RGB);
    let r = rgbMat.data[0], g = rgbMat.data[1], b_val = rgbMat.data[2];
    labMat.delete(); rgbMat.delete();
    return { r, g, b: b_val };
}

// Маршрутизация полученного кадра
function handleImageSource(canvasSource, mode) {
    const canvasTargetId = mode === 'standard' ? 'canvasStandard' : 'canvasSample';
    const colorData = processImageWithCard(canvasSource, canvasTargetId);

    if (mode === 'standard') {
        standardColorData = colorData;
        renderPatchesList('infoStandard', standardColorData);
        localStorage.setItem('cm_card_standard_data', JSON.stringify(standardColorData));

        btnSample.disabled = false;
        if (sampleColorData) compareColors();
    } else {
        sampleColorData = colorData;
        renderPatchesList('infoSample', sampleColorData);
        compareColors();
    }
}

// Отрисовка прицела
function drawTargetCrosshair(mat, cx, cy, colorScalar, radius = 27) {
    let pCenter = new cv.Point(cx, cy);
    cv.circle(mat, pCenter, radius, colorScalar, 3, cv.LINE_AA);
    cv.circle(mat, pCenter, 3, colorScalar, -1, cv.LINE_AA);
    
    cv.line(mat, new cv.Point(cx - radius - 6, cy), new cv.Point(cx + radius + 6, cy), colorScalar, 2, cv.LINE_AA);
    cv.line(mat, new cv.Point(cx, cy - radius - 6), new cv.Point(cx, cy + radius + 6), colorScalar, 2, cv.LINE_AA);
}

// Извлечение цвета из региона (LAB)
function getRegionColorLAB(labMat, cx, cy, radius = 18, useMedian = false) {
    let lVals = [], aVals = [], bVals = [];
    for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
            let dist = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
            if (dist <= radius && x >= 0 && x < labMat.cols && y >= 0 && y < labMat.rows) {
                let pixel = labMat.ucharPtr(y, x);
                lVals.push(pixel[0]);
                aVals.push(pixel[1]);
                bVals.push(pixel[2]);
            }
        }
    }
    if (lVals.length === 0) return { l: 0, a: 128, b: 128 };

    if (useMedian) {
        const getTrimmedMedian = (arr) => {
            arr.sort((a, b) => a - b);
            const trim = Math.floor(arr.length * 0.15);
            const sliced = arr.slice(trim, arr.length - trim);
            const mid = Math.floor(sliced.length / 2);
            return sliced.length % 2 !== 0 
                ? sliced[mid] 
                : Math.round((sliced[mid - 1] + sliced[mid]) / 2);
        };
        return {
            l: getTrimmedMedian(lVals),
            a: getTrimmedMedian(aVals),
            b: getTrimmedMedian(bVals)
        };
    } else {
        const sum = arr => arr.reduce((val, b) => val + b, 0);
        return {
            l: Math.round(sum(lVals) / lVals.length),
            a: Math.round(sum(aVals) / aVals.length),
            b: Math.round(sum(bVals) / bVals.length)
        };
    }
}

// Распознавание карточки, выравнивание контура и считывание плашек
function processImageWithCard(canvasSource, canvasTargetId) {
    let src = null, gray = null, blurred = null, thresh = null;
    let contours = null, hierarchy = null;
    let warped = null, warpedBgr = null, warpedLab = null, srcMat = null, dstMat = null, M = null;

    let extractedData = {
        mainMean: { l: 0, a: 128, b: 128 },
        mainMedian: { l: 0, a: 128, b: 128 },
        patchesMean: { 
            white: {l:0,a:128,b:128}, gray: {l:0,a:128,b:128}, black: {l:0,a:128,b:128},
            right1: {l:0,a:128,b:128}, right2: {l:0,a:128,b:128}, right3: {l:0,a:128,b:128}
        },
        patchesMedian: { 
            white: {l:0,a:128,b:128}, gray: {l:0,a:128,b:128}, black: {l:0,a:128,b:128},
            right1: {l:0,a:128,b:128}, right2: {l:0,a:128,b:128}, right3: {l:0,a:128,b:128}
        },
        main: { l: 0, a: 128, b: 128 },
        patches: { 
            white: {l:0,a:128,b:128}, gray: {l:0,a:128,b:128}, black: {l:0,a:128,b:128},
            right1: {l:0,a:128,b:128}, right2: {l:0,a:128,b:128}, right3: {l:0,a:128,b:128}
        }
    };

    try {
        src = cv.imread(canvasSource);
        gray = new cv.Mat();
        blurred = new cv.Mat();
        thresh = new cv.Mat();
        contours = new cv.MatVector();
        hierarchy = new cv.Mat();

        const imgWidth = src.cols;
        const imgHeight = src.rows;
        const totalArea = imgWidth * imgHeight;

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0);
        cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 3);
        cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let bestQuad = null;
        let maxArea = 0;

        for (let i = 0; i < contours.size(); ++i) {
            let cnt = contours.get(i);
            let area = cv.contourArea(cnt);

            if (area > totalArea * 0.20) {
                let peri = cv.arcLength(cnt, true);
                let approx = new cv.Mat();
                cv.approxPolyDP(cnt, approx, 0.03 * peri, true);

                if (approx.rows === 4 && cv.isContourConvex(approx)) {
                    if (area > maxArea) {
                        maxArea = area;
                        bestQuad = [];
                        for (let j = 0; j < 4; j++) {
                            bestQuad.push({
                                x: approx.data32S[j * 2],
                                y: approx.data32S[j * 2 + 1]
                            });
                        }
                    }
                }
                approx.delete();
            }
            cnt.delete();
        }

        warped = new cv.Mat();
        const scaleFactor = 1.5;
        const CARD_W = Math.round(856 * scaleFactor);
        const CARD_H = Math.round(540 * scaleFactor);

        if (bestQuad) {
            let add = bestQuad.map(p => p.x + p.y);
            let diff = bestQuad.map(p => p.y - p.x);

            let tl = bestQuad[add.indexOf(Math.min(...add))];
            let br = bestQuad[add.indexOf(Math.max(...add))];
            let tr = bestQuad[diff.indexOf(Math.min(...diff))];
            let bl = bestQuad[diff.indexOf(Math.max(...diff))];

            srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
            dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, CARD_W, 0, CARD_W, CARD_H, 0, CARD_H]);

            M = cv.getPerspectiveTransform(srcMat, dstMat);
            cv.warpPerspective(src, warped, M, new cv.Size(CARD_W, CARD_H));
        } else {
            cv.resize(src, warped, new cv.Size(CARD_W, CARD_H));
        }

        warpedBgr = new cv.Mat();
        cv.cvtColor(warped, warpedBgr, cv.COLOR_RGBA2BGR);

        warpedLab = new cv.Mat();
        cv.cvtColor(warpedBgr, warpedLab, cv.COLOR_BGR2Lab);

        const holeCenterX = Math.round(CARD_W * 0.508); 
        const holeCenterY = Math.round(CARD_H * 0.468);
        const holeRadius = Math.round(35 * scaleFactor);

        const colorPatches = [
            { key: 'white',  x: Math.round(CARD_W * 0.155), y: Math.round(CARD_H * 0.310) - Math.round(20 * scaleFactor) },
            { key: 'gray',   x: Math.round(CARD_W * 0.155), y: Math.round(CARD_H * 0.525) - Math.round(5 * scaleFactor) },
            { key: 'black',  x: Math.round(CARD_W * 0.155), y: Math.round(CARD_H * 0.740) },
            { key: 'right1', x: Math.round(CARD_W * 0.845), y: Math.round(CARD_H * 0.310) - Math.round(20 * scaleFactor) },
            { key: 'right2', x: Math.round(CARD_W * 0.845), y: Math.round(CARD_H * 0.525) - Math.round(5 * scaleFactor) },
            { key: 'right3', x: Math.round(CARD_W * 0.845), y: Math.round(CARD_H * 0.740) }
        ];

        extractedData.mainMean = getRegionColorLAB(warpedLab, holeCenterX, holeCenterY, Math.round(holeRadius * 0.6), false);
        extractedData.mainMedian = getRegionColorLAB(warpedLab, holeCenterX, holeCenterY, Math.round(holeRadius * 0.6), true);

        colorPatches.forEach(p => {
            extractedData.patchesMean[p.key] = getRegionColorLAB(warpedLab, p.x, p.y, Math.round(6 * scaleFactor), false);
            extractedData.patchesMedian[p.key] = getRegionColorLAB(warpedLab, p.x, p.y, Math.round(6 * scaleFactor), true);
        });

        extractedData.main = extractedData.mainMean;
        extractedData.patches = extractedData.patchesMean;

        const greenColor = new cv.Scalar(0, 230, 118, 255);
        drawTargetCrosshair(warped, holeCenterX, holeCenterY, greenColor, holeRadius);
        colorPatches.forEach(p => {
            drawTargetCrosshair(warped, p.x, p.y, greenColor, Math.round(12 * scaleFactor));
        });

        cv.imshow(canvasTargetId, warped);

    } finally {
        if (src) src.delete();
        if (gray) gray.delete();
        if (blurred) blurred.delete();
        if (thresh) thresh.delete();
        if (contours) contours.delete();
        if (hierarchy) hierarchy.delete();
        if (warped) warped.delete();
        if (warpedBgr) warpedBgr.delete();
        if (warpedLab) warpedLab.delete();
        if (srcMat) srcMat.delete();
        if (dstMat) dstMat.delete();
        if (M) M.delete();
    }

    return extractedData;
}
