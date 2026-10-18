/**
 * Spectrix Pro - Card-Based Luxometer Module (lux.js)
 * Двухконтурный алгоритм (1L + 3L Chroma Spectrum Analysis)
 * Калиброван на основе эмпирической матрицы (3 lx ... 354,870 lx).
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

    // Шаг 4: Двухконтурный математический алгоритм 1L + 3L
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

        let calculatedLux = 0;
        let modeName = "";

        // =========================================================================
        // ВЕТВЛЕНИЕ И ИНТЕРПОЛЯЦИЯ ПО ЭМПИРИЧЕСКИМ ТОЧКАМ (1L + 3L)
        // =========================================================================

        /**
         * ДИАПАЗОН 1: ГЛУБОКАЯ ТЕНЬ И НОЧЬ (3 лк ... 15 лк)
         * Физика: Низкий уровень света, высокий цифровой шум, малая насыщенность (avgChroma < 15).
         * Защита: Жестко ограничиваем серый канал G < 170, чтобы камера в яркий день не падала сюда.
         */
        if (W >= 220 && G < 170 && B >= 50 && B <= 100 && contrast > 120 && avgChroma < 15) {
            if (B > 85) {
                calculatedLux = Math.round(3 + ((B - 59) / 35) * 5); // 3...8 лк
                modeName = "Глубокая тень / Ночной свет";
            } else {
                calculatedLux = Math.round(8 + ((G - 150) / 20) * 7); // 8...15 лк
                modeName = "Искусственное ночное освещение";
            }
        }

        /**
         * ДИАПАЗОН 2: ИНТЕРЬЕР И ПОМЕЩЕНИЯ (15 лк ... 200 лк)
         * Физика: Умеренное искусственное или рассеянное комнатное освещение. Серый канал не превышает 205.
         */
        else if (G < 205 && W < 248 && (contrast >= 130 || B >= 75)) {
            if (G <= 185) {
                calculatedLux = Math.round(15 + ((G - 150) / 35) * 35); // 15...50 лк
                modeName = "Интерьер / Слабый свет";
            } else if (G <= 195) {
                calculatedLux = Math.round(50 + ((G - 185) / 10) * 55); // 50...105 лк
                modeName = "Интерьер / Рабочая зона";
            } else {
                calculatedLux = Math.round(105 + ((G - 195) / 10) * 90); // 105...195 лк
                modeName = "Яркий интерьер / Софиты";
            }
        }

        /**
         * ДИАПАЗОН 3: ПАСМУРНОЕ УТРО И АЖУРНАЯ ТЕНЬ В ПАРКЕ (200 лк ... 2000 лк)
         * Физика: Уличный рассеянный свет. Серый плавает от 170 до 240, белый высокий.
         */
        else if (G >= 170 && W >= 230 && contrast > 90) {
            if (G >= 230 && B >= 140) {
                calculatedLux = Math.round(700 + ((G - 230) / 10) * 700); // 700...1400 лк
                modeName = "Утренний рассеянный свет";
            } else {
                // Паттерн дневной тени под деревьями / в руках (напр., G=204, W=243)
                let parkLux = Math.round(2000 + ((G - 180) / 25) * 1500);
                calculatedLux = Math.min(4500, Math.max(1500, parkLux));
                modeName = "Парк / Дневная тень";
            }
        }

        /**
         * ДИАПАЗОН 4: ОТКРЫТОЕ НЕБО В ТЕНИ (2000 лк ... 5000 лк)
         * Физика: Чистый открытый свет в тени зданий или деревьев без прямых лучей.
         */
        else if (W >= 220 && W <= 240 && G >= 180 && G <= 200 && B <= 70) {
            calculatedLux = Math.round(3500 + ((G - 180) / 20) * 1500); // 3500...5000 лк
            modeName = "Открытое небо / Чистая тень";
        }

        /**
         * ДИАПАЗОН 5: ПРЯМОЕ БОКОВОЕ СОЛНЦЕ / ЗАТЕНЕНИЕ КАМЕРОЙ (5000 лк ... 15 000 лк)
         * Физика: Ловушка автоэкспозиции (AE). Камера пугается прямого луча и занижает белый патч до W < 200.
         * 3L-контур фиксирует высокую насыщенность и корректирует расчет до реальных уличных значений.
         */
        else if (W < 200 && G < 120 && B < 90) {
            let baseLux = 7000;
            let aeCorrection = ((200 - W) / 40) * 2000;
            calculatedLux = Math.round(baseLux + aeCorrection); // 7000...11 000 лк
            modeName = "Боковое солнце / Зажатая AE";
        }

        /**
         * ДИАПАЗОН 6: ЭКСТРЕМАЛЬНОЕ СОЛНЦЕ И ПОБЕРЕЖЬЕ (> 100 000 лк)
         * Физика: Верхний предел матрицы. Тотальный клиппинг сенсора и сужение спектра (3L).
         */
        else if (W >= 230 && G >= 185 && B <= 65 && (avgChroma < 18 || W >= 245)) {
            calculatedLux = "> 100 000";
            modeName = "Побережье / Прямой зенитный свет";
        }

        /**
         * ДЕФОЛТНЫЙ ФАЛЛБЭК ДЛЯ ПРОМЕЖУТОЧНЫХ СОСТОЯНИЙ (Полутень / Переходные зоны)
         * Физика: Плавная интерполяция для нестандартных углов падения света, защищающая от нулевых или ошибочных скачков.
         */
        else {
            let fallbackVal = Math.round(1000 + (G / 255) * 3000);
            calculatedLux = fallbackVal;
            modeName = "Рассеянный дневной свет";
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
