let mediaStream = null;
let activeMode = null;

const cameraModal = document.getElementById('cameraModal');
const video = document.getElementById('webcam');

// Запуск камеры: стандартный видеопоток с тыловой камеры (с фоллбэком на любую доступную)
async function openCamera(mode) {
    activeMode = mode;
    const titleEl = document.getElementById('cameraTitle');
    if (titleEl) {
        titleEl.innerText = mode === 'standard' ? 'Съемка Эталона' : 'Съемка Образца';
    }
    if (cameraModal) {
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

    if (video) {
        video.srcObject = mediaStream;
    }
}

// Закрытие камеры и остановка всех треков потока
function closeCamera() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (video) {
        video.srcObject = null;
    }
    if (cameraModal) {
        cameraModal.classList.remove('active');
    }
}

// Захват кадра напрямую из видеопотока по рамке видоискателя (как в старой версии)
function takeSnapshot() {
    if (!video.videoWidth || !video.videoHeight) return;

    const viewportRect = video.getBoundingClientRect();
    if (!viewportRect.width || !viewportRect.height) return;

    const strokeOffset = 2;
    const overlayFrame = {
        x: 50 + strokeOffset,
        y: 55 + strokeOffset,
        w: 300 - strokeOffset * 2,
        h: 190 - strokeOffset * 2
    };
    const overlayW = 400;
    const overlayH = 320;

    const videoRatio = video.videoWidth / video.videoHeight;
    const containerRatio = viewportRect.width / viewportRect.height;

    let renderW, renderH, offsetX, offsetY;

    if (containerRatio > videoRatio) {
        renderW = viewportRect.width;
        renderH = viewportRect.width / videoRatio;
        offsetX = 0;
        offsetY = (renderH - viewportRect.height) / 2;
    } else {
        renderH = viewportRect.height;
        renderW = viewportRect.height * videoRatio;
        offsetX = (renderW - viewportRect.width) / 2;
        offsetY = 0;
    }

    const scaleX = video.videoWidth / renderW;
    const scaleY = video.videoHeight / renderH;

    const rectViewportX = (overlayFrame.x / overlayW) * viewportRect.width;
    const rectViewportY = (overlayFrame.y / overlayH) * viewportRect.height;
    const rectViewportW = (overlayFrame.w / overlayW) * viewportRect.width;
    const rectViewportH = (overlayFrame.h / overlayH) * viewportRect.height;

    const cropX = Math.max(0, Math.round((rectViewportX + offsetX) * scaleX));
    const cropY = Math.max(0, Math.round((rectViewportY + offsetY) * scaleY));
    const cropW = Math.min(video.videoWidth - cropX, Math.round(rectViewportW * scaleX));
    const cropH = Math.min(video.videoHeight - cropY, Math.round(rectViewportH * scaleY));

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;

    const ctx = croppedCanvas.getContext('2d');
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    closeCamera();
    
    if (typeof handleImageSource === 'function') {
        handleImageSource(croppedCanvas, activeMode);
    } else {
        console.error('Функция handleImageSource не найдена!');
    }
}
