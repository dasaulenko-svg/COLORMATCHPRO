// cg-camera.js — Изолированный модуль камеры для раздела «Каталоги» (RGB)
let cgMediaStream = null;

function openCatalogCamera() {
    const cameraModal = document.getElementById('cameraModal');
    const titleEl = document.getElementById('cameraTitle');
    const targetVideo = document.getElementById('webcam');

    if (titleEl) {
        titleEl.innerText = 'Сканирование каталога (RGB)';
    }
    if (cameraModal) {
        cameraModal.classList.add('active');
    }

    navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: "environment" } }
    }).then(stream => {
        cgMediaStream = stream;
        if (targetVideo) targetVideo.srcObject = stream;
    }).catch(() => {
        navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
            cgMediaStream = stream;
            if (targetVideo) targetVideo.srcObject = stream;
        }).catch(err => {
            alert('Ошибка доступа к камере: ' + err.message);
            closeCatalogCamera();
        });
    });
}

function closeCatalogCamera() {
    if (cgMediaStream) {
        cgMediaStream.getTracks().forEach(track => track.stop());
        cgMediaStream = null;
    }
    const targetVideo = document.getElementById('webcam');
    if (targetVideo) targetVideo.srcObject = null;

    const cameraModal = document.getElementById('cameraModal');
    if (cameraModal) cameraModal.classList.remove('active');
}

function takeCatalogSnapshot() {
    const targetVideo = document.getElementById('webcam');
    const canvasCatalog = document.getElementById('canvasCatalog');
    if (!targetVideo || !targetVideo.videoWidth || !targetVideo.videoHeight || !canvasCatalog) return;

    const viewportRect = targetVideo.getBoundingClientRect();
    if (!viewportRect.width || !viewportRect.height) return;

    const imgW = targetVideo.videoWidth;
    const imgH = targetVideo.videoHeight;

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

    canvasCatalog.width = cropW;
    canvasCatalog.height = cropH;
    const ctx = canvasCatalog.getContext('2d');
    ctx.drawImage(targetVideo, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    closeCatalogCamera();

    // Запуск процесса компьютерного зрения в RGB
    if (typeof processCatalogRgb === 'function') {
        processCatalogRgb();
    }
}
