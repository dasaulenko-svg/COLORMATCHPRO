// Захват кадра напрямую из видеопотока с ожиданием готовности размеров
async function takeSnapshot() {
    const video = document.getElementById('webcam');
    if (!video) return;

    // Небольшая пауза и проверка готовности размеров видеопотока
    await new Promise(resolve => setTimeout(resolve, 150));

    if (!video.videoWidth || !video.videoHeight) {
        alert('Камера еще инициализируется, нажмите повторно через секунду.');
        return;
    }

    const viewportRect = video.getBoundingClientRect();
    if (!viewportRect.width || !viewportRect.height) return;

    const sourceElement = video;
    const imgW = video.videoWidth;
    const imgH = video.videoHeight;

    // Параметры рамки оверлея (400x320)
    const strokeOffset = 2;
    const overlayFrame = {
        x: 50 + strokeOffset,
        y: 55 + strokeOffset,
        w: 300 - strokeOffset * 2,
        h: 190 - strokeOffset * 2
    };
    const overlayW = 400;
    const overlayH = 320;

    const imgRatio = imgW / imgH;
    const containerRatio = viewportRect.width / viewportRect.height;

    let renderW, renderH, offsetX, offsetY;

    if (containerRatio > imgRatio) {
        renderW = viewportRect.width;
        renderH = viewportRect.width / imgRatio;
        offsetX = 0;
        offsetY = (renderH - viewportRect.height) / 2;
    } else {
        renderH = viewportRect.height;
        renderW = viewportRect.height * imgRatio;
        offsetX = (renderW - viewportRect.width) / 2;
        offsetY = 0;
    }

    const scaleX = imgW / renderW;
    const scaleY = imgH / renderH;

    const rectViewportX = (overlayFrame.x / overlayW) * viewportRect.width;
    const rectViewportY = (overlayFrame.y / overlayH) * viewportRect.height;
    const rectViewportW = (overlayFrame.w / overlayW) * viewportRect.width;
    const rectViewportH = (overlayFrame.h / overlayH) * viewportRect.height;

    const cropX = Math.max(0, Math.round((rectViewportX + offsetX) * scaleX));
    const cropY = Math.max(0, Math.round((rectViewportY + offsetY) * scaleY));
    const cropW = Math.min(imgW - cropX, Math.round(rectViewportW * scaleX));
    const cropH = Math.min(imgH - cropY, Math.round(rectViewportH * scaleY));

    // Рабочая ширина для OpenCV
    const TARGET_WIDTH = 1280;
    let finalW = cropW;
    let finalH = cropH;

    if (cropW > TARGET_WIDTH) {
        finalW = TARGET_WIDTH;
        finalH = Math.round((cropH * TARGET_WIDTH) / cropW);
    }

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = finalW;
    croppedCanvas.height = finalH;

    const ctx = croppedCanvas.getContext('2d');
    ctx.drawImage(sourceElement, cropX, cropY, cropW, cropH, 0, 0, finalW, finalH);

    closeCamera();
    
    if (typeof handleImageSource === 'function') {
        handleImageSource(croppedCanvas, activeMode);
    } else {
        console.error('Функция handleImageSource не найдена!');
    }
}
