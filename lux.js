/**
 * Spectrix Pro - Field Luxometer Module (lux.js)
 * Поддерживает живой замер и 5-секундный пространственный скан помещения.
 */

(function () {
    const paneLux = document.getElementById('paneLux');
    if (!paneLux) return;

    // Рендерим расширенный интерфейс люксометра
    paneLux.innerHTML = `
        <div class="card" style="margin-top: 0; text-align: center;">
            <h3 style="margin-bottom: 8px; color: var(--text-main);">☀️ Полевой люксометр</h3>
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
                Живой контроль света или 5-секундный скан помещения для усреднения зон.
            </p>

            <div class="lux-display-box" style="padding: 24px; background: rgba(0, 229, 255, 0.04); border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 16px;">
                <div id="luxValueDisplay" style="font-size: 48px; font-weight: 800; color: var(--accent-cyan); line-height: 1;">--</div>
                <div id="luxModeLabel" style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-top: 6px;">Реальное время (люкс)</div>
            </div>

            <div id="luxStatusBadge" style="padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; margin-bottom: 16px; background: rgba(255,255,255,0.05); color: var(--text-main);">
                ⏳ Инициализация датчика света...
            </div>

            <!-- Кнопка запуска 5-секундного скана помещения -->
            <button id="scanRoomBtn" class="btn-action" style="margin-bottom: 16px; width: 100%;">
                ⏱️ Скан помещения (5 сек)
            </button>

            <!-- Блок Pro-аналитики (уверенность замера) -->
            <div class="pro-analytics-box" style="text-align: left; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; font-size: 12px; border-left: 3px solid var(--accent-green);">
                <div style="font-weight: 600; margin-bottom: 4px; color: var(--text-main);">Параметр уверенности (Confidence):</div>
                <div id="luxConfidenceText" style="color: var(--text-muted);">Ожидание данных сенсора...</div>
            </div>

            <button id="luxManualBtn" class="btn-action secondary" style="margin-top: 16px; display: none;">
                🔄 Переключить в режим эмуляции
            </button>
        </div>
    `;

    const valEl = document.getElementById('luxValueDisplay');
    const modeLabelEl = document.getElementById('luxModeLabel');
    const statusEl = document.getElementById('luxStatusBadge');
    const confidenceEl = document.getElementById('luxConfidenceText');
    const scanBtn = document.getElementById('scanRoomBtn');
    const manualBtn = document.getElementById('luxManualBtn');

    let currentRawLux = 0;
    let isScanning = false;
    let sensorAvailable = false;
    let fallbackMode = false;

    function evaluateLux(lux) {
        const val = Math.round(lux);
        if (val < 50) {
            statusEl.style.background = 'rgba(255, 82, 82, 0.15)';
            statusEl.style.color = '#FF5252';
            statusEl.innerHTML = '⚠️ <b>Слишком темно</b> (< 50 лк). Риск шума матрицы!';
            confidenceEl.innerHTML = '🔴 Уверенность цвета: <b>Низкая</b>. Включите подсветку.';
            confidenceEl.parentElement.style.borderLeftColor = '#FF5252';
        } else if (val >= 50 && val < 150) {
            statusEl.style.background = 'rgba(255, 193, 7, 0.12)';
            statusEl.style.color = '#FFC107';
            statusEl.innerHTML = '💡 <b>Рабочий полумрак</b>. Допустимо для замеров.';
            confidenceEl.innerHTML = '🟡 Уверенность цвета: <b>80-85%</b> (карта компенсирует свет).';
            confidenceEl.parentElement.style.borderLeftColor = '#FFC107';
        } else if (val >= 150 && val <= 1000) {
            statusEl.style.background = 'rgba(0, 230, 118, 0.12)';
            statusEl.style.color = '#00E676';
            statusEl.innerHTML = '✨ <b>Отличное освещение</b>. Идеально для подбора.';
            confidenceEl.innerHTML = '🟢 Уверенность цвета: <b>95-100%</b> (оптимальные условия).';
            confidenceEl.parentElement.style.borderLeftColor = '#00E676';
        } else {
            statusEl.style.background = 'rgba(0, 229, 255, 0.12)';
            statusEl.style.color = 'var(--accent-cyan)';
            statusEl.innerHTML = '☀️ <b>Яркий свет</b>. Следите за бликами на стене!';
            confidenceEl.innerHTML = '🟡 Уверенность цвета: <b>85-90%</b> (возможны блики).';
            confidenceEl.parentElement.style.borderLeftColor = 'var(--accent-cyan>';
        }
    }

    // Логика 5-секундного сканирования помещения
    scanBtn.onclick = () => {
        if (isScanning) return;
        isScanning = true;
        scanBtn.disabled = true;

        let samples = [];
        let timeLeft = 5;

        modeLabelEl.textContent = 'Идет сканирование помещения...';
        statusEl.style.background = 'rgba(0, 229, 255, 0.12)';
        statusEl.style.color = 'var(--accent-cyan)';
        statusEl.innerHTML = `🔄 <b>Крутите телефон в руках!</b> Осталось: ${timeLeft} сек.`;

        // Сбор данных каждые 100 мс (10 раз в секунду)
        const sampleInterval = setInterval(() => {
            let activeVal = fallbackMode ? (Math.floor(Math.random() * 200) + 100) : currentRawLux;
            samples.push(activeVal);
        }, 100);

        // Таймер обратного отсчета каждую секунду
        const timerInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft > 0) {
                statusEl.innerHTML = `🔄 <b>Крутите телефон в руках!</b> Осталось: ${timeLeft} сек.`;
            } else {
                clearInterval(timerInterval);
                clearInterval(sampleInterval);

                // Считаем среднее арифметическое
                if (samples.length > 0) {
                    const sum = samples.reduce((a, b) => a + b, 0);
                    const avgLux = Math.round(sum / samples.length);

                    valEl.textContent = avgLux;
                    modeLabelEl.textContent = 'Среднее по помещению (5 сек скан)';
                    evaluateLux(avgLux);

                    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
                } else {
                    statusEl.innerHTML = '⚠️ Не удалось собрать данные датчика';
                }

                isScanning = false;
                scanBtn.disabled = false;
            }
        }, 1000);
    };

    // Инициализация датчика освещенности
    function initSensor() {
        if ('AmbientLightSensor' in window) {
            try {
                const sensor = new AmbientLightSensor({ frequency: 10 }); // 10 раз в секунду
                sensor.addEventListener('reading', () => {
                    sensorAvailable = true;
                    currentRawLux = sensor.illuminance;
                    if (!isScanning) {
                        valEl.textContent = Math.round(currentRawLux);
                        evaluateLux(currentRawLux);
                    }
                });
                sensor.addEventListener('error', (event) => {
                    console.warn('ALS Error:', event.error.name);
                    enableFallback('Ошибка датчика: ' + event.error.message);
                });
                sensor.start();
                statusEl.innerHTML = '✅ Датчик активен. Нажмите скан для усреднения.';
            } catch (err) {
                enableFallback('Доступ к датчику ограничен политикой браузера');
            }
        } else {
            enableFallback('Датчик освещенности не поддерживается браузером');
        }
    }

    function enableFallback(reason) {
        fallbackMode = true;
        statusEl.style.background = 'rgba(255, 255, 255, 0.05)';
        statusEl.style.color = 'var(--text-muted)';
        statusEl.innerHTML = `ℹ️ ${reason}. Включен режим эмуляции.`;
        valEl.textContent = '220';
        evaluateLux(220);

        manualBtn.style.display = 'block';
        manualBtn.onclick = () => {
            const mock = Math.floor(Math.random() * 300) + 80;
            valEl.textContent = mock;
            evaluateLux(mock);
            if (navigator.vibrate) navigator.vibrate(20);
        };
    }

    setTimeout(initSensor, 300);
})();
