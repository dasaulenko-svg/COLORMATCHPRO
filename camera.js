// Запуск камеры и получение потока из видео
async function openCamera(mode) {
    activeMode = mode;
    document.getElementById('cameraTitle').innerText = mode === 'standard' ? 'Съемка Эталона' : 'Съемка Образца';
    cameraModal.classList.add('active');

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });
        video.srcObject = mediaStream;
    } catch (err) {
        alert('Ошибка доступа к камере: ' + err.message);
        closeCamera();
    }
}

// Закрытие камеры и остановка потока
function closeCamera() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    video.srcObject = null;
    cameraModal.classList.remove('active');
}

// Прямой захват кадра из видеопотока (Frame Grab)
function takeSnapshot() {
    if (!video.videoWidth || !video.videoHeight) return;

    const viewportRect = video.getBoundingClientRect();
    if (!viewportRect.width || !viewportRect.height) return;

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

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;

    const ctx = croppedCanvas.getContext('2d');
    // Захват производится прямо из элемента <video>
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    closeCamera();
    handleImageSource(croppedCanvas, activeMode);
}
