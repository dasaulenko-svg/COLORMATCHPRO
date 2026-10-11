let mediaStream = null;
let activeMode = null;

// Элементы интерфейса (предполагается, что они существуют в DOM)
const cameraModal = document.getElementById('cameraModal');
const video = document.getElementById('webcam');

// Запуск камеры: простой запрос базового видеопотока без жестких требований к разрешению
async function openCamera(mode) {
    activeMode = mode;
    document.getElementById('cameraTitle').innerText = mode === 'standard' ? 'Съемка Эталона' : 'Съемка Образца';
    cameraModal.classList.add('active');

    try {
        // Запрашиваем стандартный видеопоток с тыловой камеры (какой даст система, такой и используем)
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });
    } catch (err) {
        try {
            // Фоллбэк на любую доступную камеру
            mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (fallbackErr) {
            alert('Ошибка доступа к камере: ' + fallbackErr.message);
            closeCamera();
            return;
        }
    }

    video.srcObject = mediaStream;
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

// Захват текущего кадра прямо из видеопотока, кроп по рамке и ресайз для OpenCV
async function takeSnapshot() {
    if (!video.videoWidth || !video.videoHeight) return;

    const viewportRect = video.getBoundingClientRect();
    if (!viewportRect.width || !viewportRect.height) return;

    // Источник — текущий кадр из видеопотока
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

    // Приводим кропнутый кадр к рабочей ширине 1280px для OpenCV
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
    // Мгновенно вырезаем нужную область из видеопотока и масштабируем
    ctx.drawImage(sourceElement, cropX, cropY, cropW, cropH, 0, 0, finalW, finalH);

    closeCamera();
    handleImageSource(croppedCanvas, activeMode);
}
