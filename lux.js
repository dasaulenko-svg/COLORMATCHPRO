/**
 * Spectrix Pro - Card-Based Luxometer Module (lux.js)
 * Сепаратный модуль люксометра: захват через camera.js -> поиск плашек -> расчет освещенности в lux.js
 */

(function () {
    function initLuxometer() {
        const paneLux = document.getElementById('paneLux');
        if (!paneLux) return;

        // Рендерим интерфейс люксометра в едином стиле приложения
        paneLux.innerHTML = `
            <div class="grid" style="grid-template-columns: 1fr; max-width: 400px; margin: 0 auto;">
                <div class="col">
                    <div class="col-header">
                        <h3>☀️ Люксометр по карте</h3>
                        <span class="step-tag">LUX</span>
                    </div>
                    
                    <div class="preview-box" onclick="openLuxCamera()">
                        <canvas id="canvasLuxCard"></canvas>
                    </div>
                    
                    <button class="btn-action" id="btnLux" onclick="openLuxCamera()" style="margin-top: 12px;">
                        📷 Снять карту для замера
                    </button>
                    
                    <div class="info-container" id="infoLux" style="margin-top: 12px;"></div>

                    <!-- Блок вывода результатов замера -->
                    <div class="card" id="infoLuxCard" style="margin-top: 16px; display: none; text-align: center;">
                        <div id="luxResultValue" style="font-size: 36px; font-weight: 800; color: var(--accent-cyan); line-height: 1.1;">--</div>
                        <div id="luxResultMode" style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-top: 6px;">Режим освещения</div>
                        <div id="luxResultDetails" style="font-size: 12px; color: var(--text-main); margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-color);"></div>
                    </div>
                </div>
            </div>
        `;
    }

    // Шаг 1: Запуск камеры через camera.js
    window.openLuxCamera = function() {
        if (typeof openCamera === 'function') {
            openCamera('lux');
            const title = document.getElementById('cameraTitle');
            if (title) title.textContent = 'Замер света по калибровочной карте';
        } else {
            console.error('Ошибка: camera.js не подключен.');
        }
    };

    // Шаг 2: Перехват кадра от camera.js и отправка в cv-процессор / пайплайн поиска плашек
    const nativeHandleImageSource = window.handleImageSource;
    window.handleImageSource = function(canvas, mode) {
        if (mode === 'lux') {
            processLuxCapture(canvas);
            return;
        }
        if (typeof nativeHandleImageSource === 'function') {
            nativeHandleImageSource(canvas, mode);
        }
    };

    // Пайплайн обработки кадра
    function processLuxCapture(canvas) {
        const infoLux = document.getElementById('infoLux');
        if (infoLux) {
            infoLux.innerHTML = '<div style="color: var(--accent-cyan); font-size: 12px;">⏳ Обработка плашек калибровочной карты...</div>';
        }

        // Отображаем превью снятой карты в интерфейсе люксометра
        const canvasThumb = document.getElementById('canvasLuxCard');
        if (canvasThumb) {
            canvasThumb.width = canvas.width;
            canvasThumb.height = canvas.height;
            const ctx = canvasThumb.getContext('2d');
            ctx.drawImage(canvas, 0, 0);
        }

        // Шаг 3: Передаем данные в cv-processor / извлекаем показатели с плашек
        extractPatchData(canvas);
    }

    // Шаг 4: Получение данных непосредственно с плашек калибровочной карты
    function extractPatchData(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        // Функция точечного сэмплирования зон плашек на карте
        const getPatchBrightness = (rx, ry, rw, rh) => {
            try {
                const imgData = ctx.getImageData(Math.floor(rx - rw/2), Math.floor(ry - rh/2), Math.max(1, Math.floor(rw)), Math.max(1, Math.floor(rh)));
                const data = imgData.data;
                let r = 0, g = 0, b = 0, count = data.length / 4;
                if (count === 0) return 128;
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i];
                    g += data[i+1];
                    b += data[i+2];
                }
                let avgR = r / count;
                let avgG = g / count;
                let avgB = b / count;
                // Перевод в шкалу яркости (L)
                return 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
            } catch (e) {
                return 128;
            }
        };

        // Собираем показатели с плашек (Белый, Серый, Черный)
        const patchData = {
            white: { l: getPatchBrightness(w * 0.3, h * 0.5, w * 0.1, h * 0.1) },
            grey:  { l: getPatchBrightness(w * 0.5, h * 0.5, w * 0.1, h * 0.1) },
            black: { l: getPatchBrightness(w * 0.7, h * 0.5, w * 0.1, h * 0.1) }
        };

        // Шаг 5: Передаем данные в собственный алгоритм люксометра
        calculateAndDisplayLux(patchData);
    }

    // Шаг 6: Собственный алгоритм расчета освещенности, зашитый в lux.js
    function calculateAndDisplayLux(patchData) {
        const infoLux = document.getElementById('infoLux');
        const infoCard = document.getElementById('infoLuxCard');
        const valEl = document.getElementById('luxResultValue');
        const modeEl = document.getElementById('luxResultMode');
        const detailsEl = document.getElementById('luxResultDetails');

        if (infoLux) infoLux.innerHTML = '';

        if (!patchData || !patchData.white || !patchData.grey || !patchData.black) {
            if (infoCard) {
                infoCard.style.display = 'block';
                valEl.textContent = 'Ошибка';
                modeEl.textContent = 'Плашки не найдены';
                if (detailsEl) detailsEl.innerHTML = 'Убедитесь, что карта расположена ровно в рамке.';
            }
            return;
        }

        const white = patchData.white.l;
        const grey  = patchData.grey.l;
        const black = patchData.black.l;

        // Логика расчета люксов на основе показателей плашек
        let result;
        if (white >= 254 && grey > 230) {
            result = { lux: "> 10000", mode: "Прямое солнце / Пересвет" };
        } else if (black < 52) {
            let indoorLux;
            if (grey < 150) {
                indoorLux = Math.max(30, Math.round(grey * 1.2));
            } else {
                indoorLux = Math.round(150 + ((grey - 150) / (175 - 150)) * 150);
            }
            result = { lux: indoorLux, mode: "Интерьер / Искусственный свет" };
        } else {
            if (grey < 180) {
                let outdoorLux = Math.round(1000 + ((grey - 160) / 20) * 2000);
                result = { lux: Math.max(1000, outdoorLux), mode: "Уличная тень / Навес" };
            } else {
                let openLux = Math.round(3000 + ((grey - 180) / 25) * 7000);
                result = { lux: Math.min(9900, Math.max(3000, openLux)), mode: "Открытая терраса / Рассеянный свет" };
            }
        }

        // Вывод результатов на экран
        if (infoCard && valEl && modeEl) {
            infoCard.style.display = 'block';
            valEl.textContent = typeof result.lux === 'number' ? result.lux + ' лк' : result.lux;
            modeEl.textContent = result.mode;
            if (detailsEl) {
                detailsEl.innerHTML = `Белый: <b>${Math.round(white)}</b> | Серый: <b>${Math.round(grey)}</b> | Чёрный: <b>${Math.round(black)}</b>`;
            }
        }

        if (navigator.vibrate) navigator.vibrate(50);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLuxometer);
    } else {
        initLuxometer();
    }
})();
