// Запуск камеры: стандартный видеопоток
async function openCamera(mode) {
    activeMode = mode;
    
    const titleEl = document.getElementById('cameraTitle');
    if (titleEl) {
        titleEl.innerText = mode === 'standard' ? 'Съемка Эталона' : 'Съемка Образца';
    }
    
    if (typeof cameraModal !== 'undefined' && cameraModal) {
        cameraModal.classList.add('active');
    }

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: "environment" } }
        });
    } catch (err) {
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (fallbackErr) {
            alert('Ошибка доступа к камере: ' + fallbackErr.message);
            closeCamera();
            return;
        }
    }

    const targetVideo = (typeof video !== 'undefined' && video) ? video : document.getElementById('webcam');
    if (targetVideo) {
        targetVideo.srcObject = mediaStream;
    }
}

// Закрытие камеры и остановка потока
function closeCamera() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    const targetVideo = (typeof video !== 'undefined' && video) ? video : document.getElementById('webcam');
    if (targetVideo) {
        targetVideo.srcObject = null;
    }
    
    const targetModal = (typeof cameraModal !== 'undefined' && cameraModal) ? cameraModal : document.getElementById('cameraModal');
    if (targetModal) {
        targetModal.classList.remove('active');
    }
}

// Захват кадра напрямую из видеопотока и кроп по рамке
function takeSnapshot() {
    const targetVideo = (typeof video !== 'undefined' && video) ? video : document.getElementById('webcam');
    if (!targetVideo || !targetVideo.videoWidth || !targetVideo.videoHeight) return;

    const viewportRect = targetVideo.getBoundingClientRect();
    if (!viewportRect.width || !viewportRect.height) return;

    const imgW = targetVideo.videoWidth;
    const imgH = targetVideo.videoHeight;

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
    ctx.drawImage(targetVideo, cropX, cropY, cropW, cropH, 0, 0, finalW, finalH);

    closeCamera();
    
    if (typeof handleImageSource === 'function') {
        handleImageSource(croppedCanvas, activeMode);
    } else {
        console.error('Функция handleImageSource не найдена!');
    }
}
