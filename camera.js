// Запуск камеры и получение потока
async function openCamera(mode) {
    activeMode = mode;
    document.getElementById('cameraTitle').innerText = mode === 'standard' ? 'Съемка Эталона' : 'Съемка Образца';
    cameraModal.classList.add('active');

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: { exact: "environment" },
                width: { ideal: 3840 },
                height: { ideal: 2160 }
            }
        });
    } catch (err) {
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 3840 },
                    height: { ideal: 2160 }
                } 
            });
        } catch (fallbackErr) {
            alert('Ошибка доступа к камере: ' + fallbackErr.message);
            closeCamera();
            return;
        }
    }

    video.srcObject = mediaStream;
    initExposureControl();
}

// Инициализация регулировки экспозиции (EV)
function initExposureControl() {
    const track = mediaStream ? mediaStream.getVideoTracks()[0] : null;
    if (!track) return;

    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if ('exposureCompensation' in capabilities) {
        minEV = capabilities.exposureCompensation.min || -2;
        maxEV = capabilities.exposureCompensation.max || 2;
        stepEV = capabilities.exposureCompensation.step || 0.1;

        const settings = track.getSettings ? track.getSettings() : {};
        currentEV = settings.exposureCompensation || 0;
    } else {
        currentEV = 0;
    }
    updateEVDisplay();
}

// Изменение значения EV
async function adjustEV(direction) {
    const track = mediaStream ? mediaStream.getVideoTracks()[0] : null;
    if (!track) return;

    let targetEV = currentEV + (direction * stepEV);
    targetEV = Math.max(minEV, Math.min(maxEV, targetEV));
    targetEV = Math.round(targetEV / stepEV) * stepEV;

    try {
        await track.applyConstraints({
            advanced: [{ exposureCompensation: targetEV }]
        });
        currentEV = targetEV;
        updateEVDisplay();
    } catch (err) {
        console.warn('Не удалось изменить экспозицию:', err);
    }
}

// Обновление интерфейса EV
function updateEVDisplay() {
    const display = document.getElementById('evValueDisplay');
    if (display) {
        const sign = currentEV > 0 ? '+' : '';
        display.innerText = `EV: ${sign}${currentEV.toFixed(1)}`;
    }
}

// Закрытие камеры
function closeCamera() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    video.srcObject = null;
    cameraModal.classList.remove('active');
}

// Захват высококачественного снимка
async function takeSnapshot() {
    if (!video.videoWidth || !video.videoHeight) return;

    const viewportRect = video.getBoundingClientRect();
    if (!viewportRect.width || !viewportRect.height) return;

    let sourceElement = video;
    let imgW = video.videoWidth;
    let imgH = video.videoHeight;

    const track = mediaStream ? mediaStream.getVideoTracks()[0] : null;

    if ('ImageCapture' in window && track) {
        try {
            const imageCapture = new ImageCapture(track);
            const blob = await imageCapture.takePhoto();
            const bitmap = await createImageBitmap(blob);
            sourceElement = bitmap;
            imgW = bitmap.width;
            imgH = bitmap.height;
        } catch (err) {
            console.warn('ImageCapture не сработал, фоллбэк на кадр из видео:', err);
        }
    }

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

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;

    const ctx = croppedCanvas.getContext('2d');
    ctx.drawImage(sourceElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    closeCamera();
    handleImageSource(croppedCanvas, activeMode);
}
