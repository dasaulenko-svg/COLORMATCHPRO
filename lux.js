/**
 * Spectrix Pro - Card-Based Luxometer Module (lux.js)
 * Интегрированный люксометр, использующий стандартный camera.js и cv-processor.js
 */

(function () {
    function initLuxometer() {
        const paneLux = document.getElementById('paneLux');
        if (!paneLux) return;

        // Рендерим блок люксометра в едином стиле интерфейса Spectrix Pro
        paneLux.innerHTML = `
            <div class="grid" style="grid-template-columns: 1fr; max-width: 400px; margin: 0 auto;">
                <div class="col">
                    <div class="col-header">
                        <h3>☀️ Люксометр по карте</h3>
                        <span class="step-tag">LUX</span>
                    </div>
                    <div class="preview-box" id="luxPreviewBox" onclick="openLuxCamera()">
                        <canvas id="canvasLuxCard"></canvas>
                    </div>
                    <button class="btn-action" id="btnLuxCapture" onclick="openLuxCamera()" style="margin-top: 12px;">
                        📸 Снять карту для замера
                    </button>
                    
                    <!-- Блок вывода результатов -->
                    <div class="card" id="infoLuxCard" style="margin-top: 16px; display: none; text-align: center;">
                        <div id="luxResultValue" style="font-size: 36px; font-weight: 800; color: var(--accent-cyan); line-height: 1.1;">--</div>
                        <div id="luxResultMode" style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-top: 6px;">Режим освещения</div>
                        <div id="luxResultDetails" style="font-size: 12px; color: var(--text-main); margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-color);"></div>
                    </div>
                </div>
            </div>
        `;
    }

    // Глобальная функция запуска камеры именно для люксометра
    window.openLuxCamera = function() {
        if (typeof openCamera === 'function') {
            // Переключаем активный режим на 'luxCard', чтобы camera.js знал, куда сохранять снимок
            window.activeLuxMode = true;
            openCamera('standard'); // Открываем стандартное модальное окно камеры
            
            // Меняем заголовок в модалке на нужный нам
            const title = document.getElementById('cameraTitle');
            if (title) title.textContent = 'Замер света по калибровочной карте';
        }
    };

    // Функция расчёта освещенности по реальным патчам карточки
    window.processLuxFromPatches = function(colorData) {
        const infoCard = document.getElementById('infoLuxCard');
        const valEl = document.getElementById('luxResultValue');
        const modeEl = document.getElementById('luxResultMode');
        const detailsEl = document.getElementById('luxResultDetails');

        if (!colorData || !colorData.white || !colorData.grey || !colorData.black) {
            if (infoCard) {
                infoCard.style.display = 'block';
                valEl.textContent = 'Ошибка';
                modeEl.textContent = 'Карта не распознана';
                detailsEl.innerHTML = 'Убедитесь, что карта полностью в кадре и хорошо освещена.';
            }
            return;
        }

        // Извлекаем яркости (L канала или среднего RGB) патчей
        const white = colorData.white.l || ((colorData.white.r + colorData.white.g + colorData.white.b) / 3);
        const grey  = colorData.grey.l  || ((colorData.grey.r + colorData.grey.g + colorData.grey.b) / 3);
        const black = colorData.black.l || ((colorData.black.r + colorData.black.g + colorData.black.b) / 3);

        // Наша проверенная физическая математика люксов
        let result;
        if (white >= 254 && grey > 230) {
            result = { lux: "> 10000", mode: "Прямое солнце / Пересвет" };
        } else if (black < 52) {
            // Помещение / Интерьер
            let indoorLux;
            if (grey < 150) {
                indoorLux = Math.max(30, Math.round(grey * 1.2));
            } else {
                indoorLux = Math.round(150 + ((grey - 150) / (175 - 150)) * 150);
            }
            result = { lux: indoorLux, mode: "Интерьер / Искусственный свет" };
        } else {
            // Улица / Терраса
            if (grey < 180) {
                let outdoorLux = Math.round(1000 + ((grey - 160) / 20) * 2000);
                result = { lux: Math.max(1000, outdoorLux), mode: "Уличная тень / Навес" };
            } else {
                let openLux = Math.round(3000 + ((grey - 180) / 25) * 7000);
                result = { lux: Math.min(9900, Math.max(3000, openLux)), mode: "Открытая терраса / Рассеянный свет" };
            }
        }

        // Выводим результат
        if (infoCard && valEl && modeEl) {
            infoCard.style.display = 'block';
            valEl.textContent = typeof result.lux === 'number' ? result.lux + ' лк' : result.lux;
            modeEl.textContent = result.mode;
            detailsEl.innerHTML = `Белый: <b>${Math.round(white)}</b> | Серый: <b>${Math.round(grey)}</b> | Чёрный: <b>${Math.round(black)}</b>`;
        }

        if (navigator.vibrate) navigator.vibrate(50);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLuxometer);
    } else {
        initLuxometer();
    }
})();
