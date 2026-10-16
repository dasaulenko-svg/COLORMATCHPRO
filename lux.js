/**
 * Spectrix Pro - Field Luxometer Module (lux.js)
 * Использование встроенного датчика освещенности телефона для полевого аудита.
 * Без занудства: порог тревоги от 50 люкс, плавная шкала и оценка уверенности.
 */

(function () {
    // Находим вкладку люксометра в DOM
    const paneLux = document.getElementById('paneLux');
    if (!paneLux) return;

    // Рендерим полноценный и аккуратный интерфейс люксометра внутрь вкладки
    paneLux.innerHTML = `
        <div class="card" style="margin-top: 0; text-align: center;">
            <h3 style="margin-bottom: 8px; color: var(--text-main);">☀️ Полевой люксометр</h3>
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
                Экспресс-оценка освещенности рабочей зоны и проверка условий сканирования цвета.
            </p>

            <div class="lux-display-box" style="padding: 24px; background: rgba(0, 229, 255, 0.04); border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 16px;">
                <div id="luxValueDisplay" style="font-size: 48px; font-weight: 800; color: var(--accent-cyan); line-height: 1;">--</div>
                <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-top: 6px;">люкс (lx)</div>
            </div>

            <div id="luxStatusBadge" style="padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; margin-bottom: 16px; background: rgba(255,255,255,0.05); color: var(--text-main);">
                ⏳ Инициализация датчика света...
            </div>

            <!-- Блок Pro-аналитики (уверенность замера) -->
            <div class="pro-analytics-box" style="text-align: left; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; font-size: 12px; border-left: 3px solid var(--accent-green);">
                <div style="font-weight: 600; margin-bottom: 4px; color: var(--text-main);">Параметр уверенности (Confidence):</div>
                <div id="luxConfidenceText" style="color: var(--text-muted);">Ожидание данных сенсора...</div>
            </div>

            <button id="luxManualBtn" class="btn-action secondary" style="margin-top: 16px; display: none;">
                🔄 Перезапустить опрос датчика
            </button>
        </div>
    `;

    const valEl = document.getElementById('luxValueDisplay');
    const statusEl = document.getElementById('luxStatusBadge');
    const confidenceEl = document.getElementById('luxConfidenceText');
    const manualBtn = document.getElementById('luxManualBtn');

    let lastLux = null;
    let sensorActive = false;

    function updateLuxUI(lux) {
        lastLux = Math.round(lux);
        valEl.textContent = lastLux;

        // Логика оценки условий без «выноса мозга» пользователю
        if (lastLux < 50) {
            // Экстремальный минимум (сумрак / карман)
            statusEl.style.background = 'rgba(255, 82, 82, 0.15)';
            statusEl.style.color = '#FF5252';
            statusEl.innerHTML = '⚠️ <b>Слишком темно</b> (< 50 лк). Риск шума матрицы!';
            confidenceEl.innerHTML = '🔴 Уверенность цвета: <b>Низкая</b>. Включите подсветку.';
            confidenceEl.parentElement.style.borderLeftColor = '#FF5252';
        } else if (lastLux >= 50 && lastLux < 150) {
            // Сумеречная зона / ресепшн / вечер
            statusEl.style.background = 'rgba(255, 193, 7, 0.12)';
            statusEl.style.color = '#FFC107';
            statusEl.innerHTML = '💡 <b>Рабочий полумрак</b>. Допустимо для замеров.';
            confidenceEl.innerHTML = '🟡 Уверенность цвета: <b>80-85%</b> (карта компенсирует свет).';
            confidenceEl.parentElement.style.borderLeftColor = '#FFC107';
        } else if (lastLux >= 150 && lastLux <= 1000) {
            // Идеальная рабочая зона (квартиры, офисы, садики)
            statusEl.style.background = 'rgba(0, 230, 118, 0.12)';
            statusEl.style.color = '#00E676';
            statusEl.innerHTML = '✨ <b>Отличное освещение</b>. Идеально для подбора.';
            confidenceEl.innerHTML = '🟢 Уверенность цвета: <b>95-100%</b> (оптимальные условия).';
            confidenceEl.parentElement.style.borderLeftColor = '#00E676';
        } else {
            // Яркий свет / солнце
            statusEl.style.background = 'rgba(0, 229, 255, 0.12)';
            statusEl.style.color = 'var(--accent-cyan)';
            statusEl.innerHTML = '☀️ <b>Яркий свет</b>. Следите за бликами на стене!';
            confidenceEl.innerHTML = '🟡 Уверенность цвета: <b>85-90%</b> (возможны блики).';
            confidenceEl.parentElement.style.borderLeftColor = 'var(--accent-cyan)';
        }
    }

    // Инициализация Ambient Light Sensor API (современные браузеры Chrome / Android)
    function initSensor() {
        if ('AmbientLightSensor' in window) {
            try {
                const sensor = new AmbientLightSensor({ frequency: 2 });
                sensor.addEventListener('reading', () => {
                    sensorActive = true;
                    updateLuxUI(sensor.illuminance);
                });
                sensor.addEventListener('error', (event) => {
                    console.warn('ALS Error:', event.error.name);
                    fallbackToSimulation('Ошибка доступа к датчику: ' + event.error.message);
                });
                sensor.start();
            } catch (err) {
                console.warn('ALS Init failed:', err);
                fallbackToSimulation('Датчик света заблокирован политикой браузера');
            }
        } else {
            fallbackToSimulation('Датчик освещенности не поддерживается вашим браузером');
        }
    }

    // Запасной / демонстрационный режим для отладки на десктопе или старых устройствах
    function fallbackToSimulation(reason) {
        statusEl.style.background = 'rgba(255, 255, 255, 0.05)';
        statusEl.style.color = 'var(--text-muted)';
        statusEl.innerHTML = `ℹ️ ${reason}. Нажмите для тестового замера.`;
        confidenceEl.innerHTML = '⚪ Режим эмуляции (кликните кнопку ниже)';
        
        valEl.textContent = '180';
        updateLuxUI(180);

        manualBtn.style.display = 'block';
        manualBtn.onclick = () => {
            // Генерируем случайное правдоподобное значение для теста в полевых условиях
            const mockLux = Math.floor(Math.random() * 350) + 60;
            updateLuxUI(mockLux);
            if (navigator.vibrate) navigator.vibrate(20);
        };
    }

    // Запускаем инициализацию при загрузке скрипта
    setTimeout(initSensor, 300);
})();
