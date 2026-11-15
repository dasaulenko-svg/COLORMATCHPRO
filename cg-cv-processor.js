// cg-cv-processor.js — Изолированный RGB компьютерный процессор для каталога
async function processCatalogRgb() {
    const canvasCatalog = document.getElementById('canvasCatalog');
    const infoCatalog = document.getElementById('infoCatalog');
    if (!canvasCatalog) return;

    if (infoCatalog) {
        infoCatalog.innerHTML = `<div style="color: #aaa; font-size: 13px;">Распознавание карточки (RGB)...</div>`;
    }

    let extractedData = null;
    
    // Пытаемся задействовать клиентское OpenCV распознавание карточки и плашек
    if (typeof window.processImageWithCard === 'function') {
        try {
            extractedData = window.processImageWithCard('canvasCatalog', 'canvasCatalog');
        } catch (e) {
            console.error('OpenCV card processing error:', e);
        }
    }

    let targetRgb = null;
    let measuredPatches = null;

    if (extractedData) {
        targetRgb = extractedData.main || extractedData.mainMean || (extractedData.mean ? extractedData.mean.main : null);
        measuredPatches = extractedData.patches || extractedData.patchesMean || (extractedData.mean ? extractedData.mean.patches : null);
    }

    // Фоллбэк: если OpenCV не смог построить контур, берем средний RGB из центральной зоны
    if (!targetRgb) {
        const ctx = canvasCatalog.getContext('2d');
        const sampleW = Math.min(60, Math.floor(canvasCatalog.width * 0.15));
        const sampleH = Math.min(60, Math.floor(canvasCatalog.height * 0.15));
        const startX = Math.floor((canvasCatalog.width - sampleW) / 2);
        const startY = Math.floor((canvasCatalog.height - sampleH) / 2);

        const imgData = ctx.getImageData(startX, startY, sampleW, sampleH);
        const data = imgData.data;

        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
            rSum += data[i];
            gSum += data[i + 1];
            bSum += data[i + 2];
            count++;
        }

        targetRgb = {
            r: Math.round(rSum / count),
            g: Math.round(gSum / count),
            b: Math.round(bSum / count)
        };
    }

    if (infoCatalog) {
        infoCatalog.innerHTML = `<div style="color: #aaa; font-size: 13px;">Запрос к серверу RGB-процессора...</div>`;
    }

    try {
        // Передаем чистые RGB данные на сервер в папку api
        const response = await fetch('/api/rgb-cv-processor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetRgb, measuredPatches })
        });

        const result = await response.json();

        if (result.success && result.match) {
            const match = result.match;
            const corr = result.correctedRgb;

            infoCatalog.innerHTML = `
                <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 8px;">
                    RGB: <span style="color: #00E5FF;">(${corr.r}, ${corr.g}, ${corr.b})</span>
                </div>
                <div style="padding: 12px; background: rgba(0, 229, 255, 0.08); border: 1px solid rgba(0, 229, 255, 0.3); border-radius: 8px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 6px; background-color: ${match.rgb_hex}; border: 2px solid #fff; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>
                    <div>
                        <div style="font-size: 14px; font-weight: 800; color: #00E5FF; letter-spacing: 0.5px;">RAL ${match.code}</div>
                        <div style="font-size: 13px; color: #FFF; font-weight: 600;">${match.name}</div>
                        <div style="font-size: 11px; color: #aaa; margin-top: 2px;">HEX: ${match.rgb_hex}</div>
                    </div>
                </div>
            `;
        } else {
            if (infoCatalog) infoCatalog.innerHTML = `<div style="color: #ff5252; font-size: 13px;">Ошибка в ответе сервера</div>`;
        }
    } catch (e) {
        console.error('Fetch error:', e);
        if (infoCatalog) infoCatalog.innerHTML = `<div style="color: #ff5252; font-size: 13px;">Ошибка связи с сервером</div>`;
    }
}
