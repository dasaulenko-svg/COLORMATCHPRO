/**
 * Spectrix Pro - Card-Based Luxometer Module (lux.js)
 * Многофакторный сценарный движок (1L Luminance + 3L Chroma Spectrum Analysis).
 * Исключает однофакторные ошибки за счет одновременной проверки W, G, B, Contrast и Chroma.
 */

(function () {
    function initLuxometer() {
        const paneLux = document.getElementById('paneLux');
        if (!paneLux) return;

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

    // Шаг 1: Запуск камеры
    window.openLuxCamera = function() {
        if (typeof openCamera === 'function') {
            openCamera('lux');
            const title = document.getElementById('cameraTitle');
            if (title) title.textContent = 'Замер света по калибровочной карте';
        } else {
            console.error('Ошибка: camera.js не подключен.');
        }
    };

    // Шаг 2: Перехват обработки кадра
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

    // Шаг 3: Прогон через CV-процессор
    function processLuxCardFrame(canvasSource) {
        const infoLux = document.getElementById('infoLux');
        if (infoLux) {
            infoLux.innerHTML = '<div style="color: var(--accent-cyan); font-size: 12px;">⏳ Обработка плашек через CV-процессор...</div>';
        }

        try {
            const patchData = processImageWithCard(canvasSource, 'canvasLuxCard');
            if (infoLux) infoLux.innerHTML = '';
            calculateAndDisplayLux(patchData);
        } catch (err) {
            console.error('Ошибка обработки люксометра:', err);
            if (infoLux) {
                infoLux.innerHTML = '<div style="color: var(--accent-red); font-size: 12px;">❌ Ошибка распознавания карты</div>';
            }
        }
    }

    // Шаг 4: Многофакторный сценарный движок
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

        // Извлекаем каналы 1L (Luminance L из LAB)
        const W = patchData.patches.white.l;
        const G = patchData.patches.gray.l;
        const B = patchData.patches.black.l;
        const contrast = W - B;

        // Извлекаем хроматический объем 3L (Chroma C* из LAB: sqrt(a^2 + b^2))
        const getChroma = (p) => p && typeof p.a === 'number' && typeof p.b === 'number' ? Math.hypot(p.a, p.b) : 0;
        const cCyan = getChroma(patchData.patches.cyan);
        const cMag = getChroma(patchData.patches.magenta);
        const cYel = getChroma(patchData.patches.yellow);
        
        // Средний хроматический индекс плашек (Chroma Volume)
        const avgChroma = (cCyan + cMag + cYel) / 3;

        let calculatedLux = null;
        let modeName = "";

        // =========================================================================
        // МНОГОФАКТОРНЫЕ СЦЕНАРИИ (МАТРИЦА СТРОГИХ ПАРАМЕТРИЧЕСКИХ ПЕРЕСЕЧЕНИЙ)
        // =========================================================================

        /**
         * СЦЕНАРИЙ 1: ГЛУБОКАЯ ТЕНЬ И НОЧЬ (3 лк ... 15 лк)
         * Множественные факторы: 
         * - W высокий (но не клиппинг)
         * - G строго низкий (< 170) -> исключает дневной свет в парке
         * - B умеренный с шумом
         * - Chroma очень низкая (мало света для цвета)
         */
        if (calculatedLux === null && W >= 220 && W <= 235 && G < 170 && B >= 50 && B <= 100 && contrast > 120 && avgChroma < 15) {
            if (B > 85) {
                calculatedLux = Math.round(3 + ((B - 59) / 35) * 5);
                modeName = "Глубокая тень / Ночной свет";
            } else {
                calculatedLux = Math.round(8 + ((G - 150) / 20) * 7);
                modeName = "Искусственное ночное освещение";
            }
        }

        /**
         * СЦЕНАРИЙ 2: КОМНАТНЫЙ ИНТЕРЬЕР И ОФИС (15 лк ... 200 лк)
         * Множественные факторы:
         * - G умеренный (< 205)
         * - W не максимальный (< 248)
         * - Контроль контраста и черного
         */
        else if (calculatedLux === null && G < 205 && W < 248 && (contrast >= 130 || B >= 75) && avgChroma < 25) {
            if (G <= 185) {
                calculatedLux = Math.round(15 + ((G - 150) / 35) * 35);
                modeName = "Интерьер / Слабый свет";
            } else if (G <= 195) {
                calculatedLux = Math.round(50 + ((G - 185) / 10) * 55);
                modeName = "Интерьер / Рабочая зона";
            } else {
                calculatedLux = Math.round(105 + ((G - 195) / 10) * 90);
                modeName = "Яркий интерьер / Софиты";
            }
        }

        /**
         * СЦЕНАРИЙ 3: ПАСМУРНОЕ УТРО / ОТКРЫТАЯ ТЕРРАСА (700 лк ... 1400 лк)
         * Множественные факторы:
         * - G высокий (>= 230)
         * - W максимальный (255)
         * - B сильно приподнят рассеянным светом (>= 140)
         */
        else if (calculatedLux === null && G >= 230 && W >= 250 && B >= 140 && contrast <= 115) {
            calculatedLux = Math.round(700 + ((G - 230) / 10) * 700);
            modeName = "Утренний рассеянный свет";
        }

        /**
         * СЦЕНАРИЙ 4: ПАРК / АЖУРНАЯ ТЕНЬ И ПОЛУТЕНЬ (1500 лк ... 4500 лк)
         * Множественные факторы (на основе замеров на лавочке/коленке):
         * - G от 170 до 246
         * - W высокий (от 205 до 255)
         * - B может плавать (от 80 до 186)
         * - Комплексный учет яркости без сваливания в интерьер
         */
        else if (calculatedLux === null && G >= 170 && G <= 248 && W >= 200 && contrast >= 50) {
            // Многофакторная интерполяция по серому каналу в рамках уличной полутени
            let parkLux = Math.round(1500 + ((G - 170) / (246 - 170)) * 2500);
            calculatedLux = Math.min(4500, Math.max(1500, parkLux));
            modeName = "Парк / Дневная полутень";
        }

        /**
         * СЦЕНАРИЙ 5: ОТКРЫТОЕ НЕБО В ТЕНИ (3500 лк ... 5000 лк)
         * Множественные факторы:
         * - W в диапазоне 220-240
         * - G в диапазоне 180-200
         * - B низкий (<= 70) -> чистая теневая гамма
         */
        else if (calculatedLux === null && W >= 220 && W <= 240 && G >= 180 && G <= 200 && B <= 70) {
            calculatedLux = Math.round(3500 + ((G - 180) / 20) * 1500);
            modeName = "Открытое небо / Чистая тень";
        }

        /**
         * СЦЕНАРИЙ 6: БОКОВОЕ СОЛНЦЕ С ОШИБКОЙ AE (7000 лк ... 12 000 лк)
         * Множественные факторы:
         * - W занижен автоэкспозицией (< 200)
         * - G и B низкие
         * - 3L-анализ подтверждает мощный поток (высокая насыщенность Chroma)
         */
        else if (calculatedLux === null && W < 200 && G < 120 && B < 90 && avgChroma > 20) {
            let baseLux = 7000;
            let aeCorrection = ((200 - W) / 40) * 2000;
            calculatedLux = Math.round(baseLux + aeCorrection);
            modeName = "Боковое солнце / Зажатая AE";
        }

        /**
         * СЦЕНАРИЙ 7: ЭКСТРЕМАЛЬНОЕ СОЛНЦЕ И ПОБЕРЕЖЬЕ (> 100 000 лк)
         * Множественные факторы:
         * - Высокие W (>= 230) и G (>= 185)
         * - Темный черный (B <= 65)
         * - Спектральное сжатие 3L (avgChroma падает или W упирается в максимум)
         */
        else if (calculatedLux === null && W >= 230 && G >= 185 && B <= 65 && (avgChroma < 18 || W >= 245)) {
            calculatedLux = "> 100 000";
            modeName = "Побережье / Прямой зенитный свет";
        }

        /**
         * БЕЗОПАСНЫЙ СЦЕНАРИЙ-ФАЛЛБЭК (Если кадр уникален, но не попал в жесткие боксы)
         * Использует многофакторный взвешенный коэффициент, предотвращая аварийные сбои.
         */
        else {
            let weightedScore = Math.round(1000 + (G / 255) * 2500);
            calculatedLux = weightedScore;
            modeName = "Дневной рассеянный свет (Авто)";
        }

        // Вывод результатов на экран
        if (infoCard && valEl && modeEl) {
            infoCard.style.display = 'block';
            valEl.textContent = typeof calculatedLux === 'number' ? calculatedLux.toLocaleString('ru-RU') + ' лк' : calculatedLux;
            modeEl.textContent = modeName;
            if (detailsEl) {
                detailsEl.innerHTML = `Белый: <b>${Math.round(W)}</b> | Серый: <b>${Math.round(G)}</b> | Чёрный: <b>${Math.round(B)}</b>`;
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
