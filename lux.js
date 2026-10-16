/**
 * Spectrix Pro - Card-Based Luxometer Module (lux.js)
 * Точный замер освещенности по калибровочной карточке в стиле вкладки "Сравнение".
 */

(function () {
    let luxCanvasId = 'canvasLuxCard';
    let isLuxCameraOpen = false;

    function initLuxometer() {
        const paneLux = document.getElementById('paneLux');
        if (!paneLux) return;

        // Рендерим точно такой же блок, как "Эталон" во вкладке Сравнение
        paneLux.innerHTML = `
            <div class="grid" style="grid-template-columns: 1fr; max-width: 400px; margin: 0 auto;">
                <div class="col">
                    <div class="col-header">
                        <h3>☀️ Люксометр по карте</h3>
                        <span class="step-tag">LUX</span>
                    </div>
                    <div class="preview-box" id="luxPreviewBox">
                        <canvas id="${luxCanvasId}"></canvas>
                    </div>
                    <button class="btn-action" id="btnLuxCapture" style="margin-top: 12px;">
                        📸 Снять карту для замера
                    </button>
                    
                    <!-- Блок вывода результатов по нашей логике -->
                    <div class="card" id="infoLuxCard" style="margin-top: 16px; display: none; text-align: center;">
                        <div id="luxResultValue" style="font-size: 36px; font-weight: 800; color: var(--accent-cyan); line-height: 1.1;">--</div>
                        <div id="luxResultMode" style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-top: 6px;">Режим освещения</div>
                        <div id="luxResultDetails" style="font-size: 12px; color: var(--text-main); margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-color);"></div>
                    </div>
                </div>
            </div>
        `;

        const btnCapture = document.getElementById('btnLuxCapture');
        if (btnCapture) {
            btnCapture.onclick = () => {
                // Используем глобальную функцию открытия камеры из camera.js, но подменяем режим
                if (typeof openCamera === 'function') {
                    // Переиспользуем модалку камеры, перехватив сохранение для люксометра
                    openCustomLuxCamera();
                }
            };
        }
    }

    function openCustomLuxCamera() {
        const modal = document.getElementById('cameraModal');
        const video = document.getElementById('webcam');
        const title = document.getElementById('cameraTitle');
        if (!modal || !video) return;

        title.textContent = 'Замер света по карте';
        modal.classList.add('active');
        isLuxCameraOpen = true;

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            }).then(stream => {
                window.luxStream = stream;
                video.srcObject = stream;
                video.play();
            }).catch(err => {
                console.warn('Camera error:', err);
                alert('Не удалось получить доступ к камере');
            });
        }
    }

    // Перехватываем кнопку снимка в модалке, если открыт люксометр
    document.addEventListener('click', (e) => {
        if (!isLuxCameraOpen) return;
        
        // Если кликнули на кнопку сброса/модалки камеры "Сделать снимок"
        const cameraModal = document.getElementById('cameraModal');
        if (e.target && e.target.matches('.camera-modal .btn-action')) {
            // Предотвращаем стандартное поведение сравнения
            e.stopImmediatePropagation();
            
            const video = document.getElementById('webcam');
            const canvas = document.getElementById(luxCanvasId);
            if (!video || !canvas) return;

            // Рисуем кадр в наш холст люксометра
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Закрываем камеру
            if (window.luxStream) {
                window.luxStream.getTracks().forEach(t => t.stop());
                window.luxStream = null;
            }
            if (cameraModal) cameraModal.classList.remove('active');
            isLuxCameraOpen = false;

            // Обрабатываем снимок по нашей логике патчей
            processLuxCard(canvas);
        }
    }, true);

    function processLuxCard(canvas) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const w = canvas.width;
        const h = canvas.height;

        // Берём центральную область под карту
        const cx = Math.floor(w * 0.25);
        const cy = Math.floor(h * 0.25);
        const cw = Math.floor(w * 0.5);
        const ch = Math.floor(h * 0.5);

        const imgData = ctx.getImageData(cx, cy, cw, ch);
        const data = imgData.data;

        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        let minL = 255;
        let maxL = 0;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            const l = 0.299 * r + 0.587 * g + 0.114 * b;
            rSum += r; gSum += g; bSum += b;
            if (l < minL) minL = l;
            if (l > maxL) maxL = l;
            count++;
        }

        const avgL = 0.299 * (rSum / count) + 0.587 * (gSum / count) + 0.114 * (bSum / count);

        // Симулируем патчи на основе анализа карточки
        const simulatedWhite = Math.min(255, Math.round(maxL * 0.95));
        const simulatedGrey  = Math.round(avgL);
        const simulatedBlack = Math.max(10, Math.round(minL * 1.1));

        // Вычисляем люксы по нашей детальной логике
        const result = estimateLuxFromCard(simulatedWhite, simulatedGrey, simulatedBlack);

        // Выводим результат в карточку
        const infoCard = document.getElementById('infoLuxCard');
        const valEl = document.getElementById('luxResultValue');
        const modeEl = document.getElementById('luxResultMode');
        const detailsEl = document.getElementById('luxResultDetails');

        if (infoCard && valEl && modeEl) {
            infoCard.style.display = 'block';
            valEl.textContent = typeof result.lux === 'number' ? result.lux + ' лк' : result.lux;
            modeEl.textContent = result.mode;
            detailsEl.innerHTML = `Серый: <b>${simulatedGrey}</b> | Чёрный: <b>${simulatedBlack}</b> | Белый: <b>${simulatedWhite}</b>`;
        }

        if (navigator.vibrate) navigator.vibrate(50);
    }

    // Математика расчёта по патчам, которую мы нарабатывали
    function estimateLuxFromCard(white, grey, black) {
        if (white >= 254 && grey > 230) {
            return { lux: "> 10000", mode: "Прямое солнце / Пересвет" };
        }

        const isIndoor = black < 52;

        if (isIndoor) {
            let indoorLux;
            if (grey < 150) {
                indoorLux = Math.max(30, Math.round(grey * 1.2));
            } else {
                indoorLux = Math.round(150 + ((grey - 150) / (175 - 150)) * 150);
            }
            return { lux: indoorLux, mode: "Интерьер / Искусственный свет" };
        } else {
            if (grey < 180) {
                let outdoorLux = Math.round(1000 + ((grey - 160) / 20) * 2000);
                return { lux: Math.max(1000, outdoorLux), mode: "Уличная тень / Навес" };
            } else {
                let openLux = Math.round(3000 + ((grey - 180) / 25) * 7000);
                return { lux: Math.min(9900, Math.max(3000, openLux)), mode: "Открытая терраса / Рассеянный свет" };
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLuxometer);
    } else {
        initLuxometer();
    }
})();
