/**
 * Spectrix Pro - Card-Based Luxometer Module (lux.js)
 * Полная аналогия вкладки «Сравнение»: камера -> CV-процессор (поиск плашек) -> расчет освещенности.
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

    // Шаг 1: Запуск камеры через camera.js с режимом 'lux'
    window.openLuxCamera = function() {
        if (typeof openCamera === 'function') {
            openCamera('lux');
            const title = document.getElementById('cameraTitle');
            if (title) title.textContent = 'Замер света по калибровочной карте';
        } else {
            console.error('Ошибка: camera.js не подключен.');
        }
    };

    // Шаг 2: Перехватываем стандартный вызов handleImageSource из camera.js для режима 'lux'
    const nativeHandleImageSource = window.handleImageSource;
    window.handleImageSource = function(canvasSource, mode) {
        if (mode === 'lux') {
            processLuxCardFrame(canvasSource);
            return;
        }
        if (typeof nativeHandleImageSource === 'function') {
            nativeHandleImageSource(canvasSource, mode);
        }
    };

    // Шаг 3: Прогоняем кадр через штатный cv-процессор (processImageWithCard), 
    // чтобы карточка выровнялась по перспективе точно так же, как на вкладке «Сравнение»
    function processLuxCardFrame(canvasSource) {
        const infoLux = document.getElementById('infoLux');
        if (infoLux) {
            infoLux.innerHTML = '<div style="color: var(--accent-cyan); font-size: 12px;">⏳ Обработка плашек через CV-процессор...</div>';
        }

        try {
            // Вызываем родную функцию поиска карты и плашек из cv-processor.js, 
            // передавая ей целевой холст превью люксометра ('canvasLuxCard')
            const patchData = processImageWithCard(canvasSource, 'canvasLuxCard');

            if (infoLux) infoLux.innerHTML = '';

            // Шаг 4: Передаем полученные данные плашек в наш алгоритм расчета освещенности
            calculateAndDisplayLux(patchData);

        } catch (err) {
            console.error('Ошибка обработки люксометра:', err);
            if (infoLux) {
                infoLux.innerHTML = '<div style="color: var(--accent-red); font-size: 12px;">❌ Ошибка распознавания карты</div>';
            }
        }
    }

    // Шаг 5: Алгоритм расчета освещенности на основе данных плашек (Белый, Серый, Черный)
    function calculateAndDisplayLux(patchData) {
        const infoCard = document.getElementById('infoLuxCard');
        const valEl = document.getElementById('luxResultValue');
        const modeEl = document.getElementById('luxResultMode');
        const detailsEl = document.getElementById('luxResultDetails');

        if (!patchData || !patchData.patches || !patchData.patches.white || !patchData.patches.gray || !patchData.patches.black) {
            if (infoCard) {
                infoCard.style.display = 'block';
                valEl.textContent = 'Ошибка';
                modeEl.textContent = 'Плашки не найдены';
                if (detailsEl) detailsEl.innerHTML = 'Убедитесь, что карта расположена ровно в рамке.';
            }
            return;
        }

        // Берем компоненту яркости (L) из LAB-пространства плашек, посчитанных CV-процессором
        const white = patchData.patches.white.l;
        const grey  = patchData.patches.gray.l;
        const black = patchData.patches.black.l;

        // Физическая логика расчета люксов
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
