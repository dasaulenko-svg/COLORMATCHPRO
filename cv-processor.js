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

// Детекция ArUco маркеров, трансформации перспективы и считывание плашек
function processImageWithCard(canvasSource, canvasTargetId) {
    let src = null, warped = null, warpedBgr = null, warpedLab = null;
    let srcMat = null, dstMat = null, M = null;

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

    const scaleFactor = 1.5;
    const CARD_W = Math.round(856 * scaleFactor);
    const CARD_H = Math.round(540 * scaleFactor);

    try {
        src = cv.imread(canvasSource);
        warped = new cv.Mat();

        let warpSuccess = false;

        // Безопасная детекция ArUco
        if (typeof AR !== 'undefined' && AR.Detector) {
            try {
                const ctx = canvasSource.getContext('2d');
                if (ctx) {
                    const imageData = ctx.getImageData(0, 0, canvasSource.width, canvasSource.height);
                    const detector = new AR.Detector({ dictionaryName: 'ARUCO' });
                    const markers = detector.detect(imageData);

                    if (markers && markers.length >= 4) {
                        // Вычисляем центры первых 4 маркеров
                        let points = markers.slice(0, 4).map(m => {
                            let cx = (m.corners[0].x + m.corners[1].x + m.corners[2].x + m.corners[3].x) / 4;
                            let cy = (m.corners[0].y + m.corners[1].y + m.corners[2].y + m.corners[3].y) / 4;
                            return { x: cx, y: cy };
                        });

                        let add = points.map(p => p.x + p.y);
                        let diff = points.map(p => p.y - p.x);

                        let tl = points[add.indexOf(Math.min(...add))];
                        let br = points[add.indexOf(Math.max(...add))];
                        let tr = points[diff.indexOf(Math.min(...diff))];
                        let bl = points[diff.indexOf(Math.max(...diff))];

                        srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
                        dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
                            CARD_W * 0.095, CARD_H * 0.140, // TL
                            CARD_W * 0.905, CARD_H * 0.140, // TR
                            CARD_W * 0.905, CARD_H * 0.860, // BR
                            CARD_W * 0.095, CARD_H * 0.860  // BL
                        ]);

                        M = cv.getPerspectiveTransform(srcMat, dstMat);
                        cv.warpPerspective(src, warped, M, new cv.Size(CARD_W, CARD_H));
                        warpSuccess = true;
                    }
                }
            } catch (arucoErr) {
                console.warn("Ошибка при работе ArUco детектора, переходим на ресайз:", arucoErr);
            }
        }

        // Фолбэк: если маркеры не были найдены или библиотека недоступна
        if (!warpSuccess) {
            cv.resize(src, warped, new cv.Size(CARD_W, CARD_H));
        }

        warpedBgr = new cv.Mat();
        cv.cvtColor(warped, warpedBgr, cv.COLOR_RGBA2BGR);

        warpedLab = new cv.Mat();
        cv.cvtColor(warpedBgr, warpedLab, cv.COLOR_BGR2Lab);

        // Точные физические координаты центрального отверстия и цветных контрольных плашек
        const holeCenterX = Math.round(CARD_W * 0.508); 
        const holeCenterY = Math.round(CARD_H * 0.470);
        const holeRadius = Math.round(35 * scaleFactor);

        const colorPatches = [
            { key: 'white',  x: Math.round(CARD_W * 0.228), y: Math.round(CARD_H * 0.295) },
            { key: 'gray',   x: Math.round(CARD_W * 0.228), y: Math.round(CARD_H * 0.515) },
            { key: 'black',  x: Math.round(CARD_W * 0.228), y: Math.round(CARD_H * 0.735) },
            { key: 'right1', x: Math.round(CARD_W * 0.812), y: Math.round(CARD_H * 0.295) }, // Cyan
            { key: 'right2', x: Math.round(CARD_W * 0.812), y: Math.round(CARD_H * 0.515) }, // Magenta
            { key: 'right3', x: Math.round(CARD_W * 0.812), y: Math.round(CARD_H * 0.735) }  // Yellow
        ];

        extractedData.mainMean = getRegionColorLAB(warpedLab, holeCenterX, holeCenterY, Math.round(holeRadius * 0.6), false);
        extractedData.mainMedian = getRegionColorLAB(warpedLab, holeCenterX, holeCenterY, Math.round(holeRadius * 0.6), true);

        colorPatches.forEach(p => {
            extractedData.patchesMean[p.key] = getRegionColorLAB(warpedLab, p.x, p.y, Math.round(6 * scaleFactor), false);
            extractedData.patchesMedian[p.key] = getRegionColorLAB(warpedLab, p.x, p.y, Math.round(6 * scaleFactor), true);
        });

        extractedData.main = extractedData.mainMean;
        extractedData.patches = extractedData.patchesMean;

        // Отрисовка зеленых прицелов для визуального контроля
        const greenColor = new cv.Scalar(0, 230, 118, 255);
        drawTargetCrosshair(warped, holeCenterX, holeCenterY, greenColor, holeRadius);
        colorPatches.forEach(p => {
            drawTargetCrosshair(warped, p.x, p.y, greenColor, Math.round(12 * scaleFactor));
        });

        // Запись готового превью на элемент canvas
        cv.imshow(canvasTargetId, warped);

    } catch (err) {
        console.error("Ошибка в processImageWithCard:", err);
    } finally {
        if (src) src.delete();
        if (warped) warped.delete();
        if (warpedBgr) warpedBgr.delete();
        if (warpedLab) warpedLab.delete();
        if (srcMat) srcMat.delete();
        if (dstMat) dstMat.delete();
        if (M) M.delete();
    }

    return extractedData;
}

// Вывод списка плашек в режиме PRO
function renderPatchesList(elementId, dataObj) {
    const container = document.getElementById(elementId);
    if (!dataObj || !dataObj.main) {
        container.innerHTML = '';
        return;
    }

    const patchNames = {
        white: 'Белый', gray: 'Серый', black: 'Чёрный',
        right1: 'Cyan', right2: 'Magenta', right3: 'Yellow'
    };

    const m = dataObj.main;
    const p = dataObj.patches;
    const rgbMain = labToRgb(m.l, m.a, m.b);

    let html = `<div class="patches-list">
        <div class="patch-row main-patch">
            <span class="swatch-dot" style="background: rgb(${rgbMain.r},${rgbMain.g},${rgbMain.b});"></span>
            <span class="patch-text"><b>Цель (LAB):</b> ${m.l}, ${m.a}, ${m.b}</span>
        </div>`;

    for (const key of ['white', 'gray', 'black', 'right1', 'right2', 'right3']) {
        if (p && p[key]) {
            const c = p[key];
            const rgbP = labToRgb(c.l, c.a, c.b);
            html += `
                <div class="patch-row">
                    <span class="swatch-dot" style="background: rgb(${rgbP.r},${rgbP.g},${rgbP.b});"></span>
                    <span class="patch-text">${patchNames[key]}: ${c.l}, ${c.a}, ${c.b}</span>
                </div>
            `;
        }
    }

    html += `</div>`;
    container.innerHTML = html;
}

// Отправка данных на Node.js сервер
async function compareColors() {
    if (!standardColorData || !sampleColorData) return;

    infoCard.style.display = 'block';
    resultDiv.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted);">
            ⏳ Идёт расчет алгоритмов на сервере...
        </div>
    `;

    try {
        const response = await fetch('https://colormatchpro-two.vercel.app/api/calibrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                standard: standardColorData,
                sample: sampleColorData
            })
        });

        if (!response.ok) throw new Error('Ошибка ответа сервера');

        const data = await response.json();
        const matchPercent = extractPercent(data.html) || '100%';

        resultDiv.innerHTML = `
            <div class="lite-verdict-box">
                <span class="lite-verdict-title">Совпадение цвета</span>
                <span class="lite-verdict-value">${matchPercent}</span>
            </div>
            <div class="lite-verdict-info">
                <div><b class="match-success">90-100%</b> - Идеальное совпадение, можно красить различные детали авто, класть плитку через шов затирки, красить стены красками из разных партий.</div>
                <div><b class="match-warning">64-89%</b> - Частичное совпадение. Можно класть отличную по цвету плитку в гардеробных и малозаметных участках, красить авто с градиентным переходом, красить стены с градиентным растворением на малоосвещенных местах.</div>
                <div><b class="match-error">Менее 63%</b> - Нет совпадения.</div>
            </div>
            <div class="pro-details" style="display:none;">
                ${data.html}
            </div>
        `;

    } catch (err) {
        console.error(err);
        resultDiv.innerHTML = `
            <div style="color: var(--accent-red); padding: 12px; text-align: center;">
                ❌ Ошибка соединения с сервером
            </div>
        `;
    }
}

function extractPercent(htmlString) {
    const temp = document.createElement('div');
    temp.innerHTML = htmlString;
    const totalVals = temp.querySelectorAll('.final-total-value');
    return totalVals.length > 0 ? totalVals[totalVals.length - 1].innerText.trim() : null;
}

// Восстановление сохраненного эталона
function restoreState() {
    const savedData = localStorage.getItem('cm_card_standard_data');
    if (savedData) {
        standardColorData = JSON.parse(savedData);
        renderPatchesList('infoStandard', standardColorData);
        btnSample.disabled = false;
    }
}

// Логика Pinch-to-Zoom превью
let zoomScale = 1, zoomPosX = 0, zoomPosY = 0, initialDist = 0, initialScale = 1, isDragging = false, startX = 0, startY = 0;

function openZoomModal(canvasId) {
    const sourceCanvas = document.getElementById(canvasId);
    if (!sourceCanvas || sourceCanvas.width === 0) return;

    const zoomCanvas = document.getElementById('zoomCanvas');
    zoomCanvas.width = sourceCanvas.width;
    zoomCanvas.height = sourceCanvas.height;
    const ctx = zoomCanvas.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0);

    document.getElementById('zoomTitle').innerText = canvasId === 'canvasStandard' ? 'Превью: Эталон' : 'Превью: Образец';

    zoomScale = 1; zoomPosX = 0; zoomPosY = 0;
    updateZoomTransform();
    document.getElementById('zoomModal').classList.add('active');
}

function closeZoomModal() {
    document.getElementById('zoomModal').classList.remove('active');
}

function updateZoomTransform() {
    const zoomCanvas = document.getElementById('zoomCanvas');
    zoomCanvas.style.transform = `translate(${zoomPosX}px) scale(${zoomScale})`;
}

const zoomViewport = document.getElementById('zoomViewport');

if (zoomViewport) {
    zoomViewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            isDragging = false;
            initialDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            initialScale = zoomScale;
        } else if (e.touches.length === 1) {
            isDragging = true;
            startX = e.touches[0].clientX - zoomPosX;
            startY = e.touches[0].clientY - zoomPosY;
        }
    });

    zoomViewport.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            if (initialDist > 0) {
                zoomScale = Math.min(Math.max(1, initialScale * (currentDist / initialDist)), 5);
                updateZoomTransform();
            }
        } else if (e.touches.length === 1 && isDragging) {
            e.preventDefault();
            if (zoomScale > 1) {
                zoomPosX = e.touches[0].clientX - startX;
                zoomPosY = e.touches[0].clientY - startY;
                updateZoomTransform();
            }
        }
    }, { passive: false });

    zoomViewport.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) initialDist = 0;
        if (e.touches.length === 0) isDragging = false;
    });

    zoomViewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.2 : -0.2;
        zoomScale = Math.min(Math.max(1, zoomScale + delta), 5);
        if (zoomScale === 1) { zoomPosX = 0; zoomPosY = 0; }
        updateZoomTransform();
    }, { passive: false });
}
