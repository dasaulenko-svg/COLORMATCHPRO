/**
 * Spectrix Pro - Card-Based Luxometer Module (lux.js)
 * Точный замер освещенности по калибровочной карточке COLORMATCHPRO.
 */

(function () {
    function initLuxometer() {
        const paneLux = document.getElementById('paneLux');
        if (!paneLux) return;

        // Рендерим интерфейс люксометра с одним окном (как в эталоне)
        paneLux.innerHTML = `
            <div class="card" style="margin-top: 0; text-align: center;">
                <h3 style="margin-bottom: 8px; color: var(--text-main);">📷 Люксометр по карточке</h3>
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
                    Поместите карту COLORMATCHPRO в рамку и нажмите кнопку замера.
                </p>

                <!-- Видоискатель камеры с рамкой-подсказкой -->
                <div style="position: relative; width: 100%; max-width: 360px; margin: 0 auto 16px auto; border-radius: 12px; overflow: hidden; background: #000; border: 1px solid var(--border-color);">
                    <video id="cardLuxVideo" autoplay playsinline muted style="width: 100%; display: block;"></video>
                    <canvas id="cardLuxCanvas" style="display: none;"></canvas>
                    
                    <div style="position: absolute; top: 15%; left: 10%; right: 10%; bottom: 15%; border: 2px dashed rgba(0, 229, 255, 0.7); border-radius: 8px; pointer-events: none; display: flex; align-items: flex-start; justify-content: center; padding-top: 6px;">
                        <span style="background: rgba(0,0,0,0.6); color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 4px;">Карта должна быть здесь</span>
                    </div>
                </div>

                <!-- Дисплей результата -->
                <div class="lux-display-box" style="padding: 20px; background: rgba(0, 229, 255, 0.04); border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 16px;">
                    <div id="cardLuxValue" style="font-size: 42px; font-weight: 800; color: var(--accent-cyan); line-height: 1;">--</div>
                    <div id="cardLuxMode" style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-top: 6px;">Ожидание снимка карточки</div>
                </div>

                <div id="cardLuxStatus" style="padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; margin-bottom: 16px; background: rgba(255,255,255,0.05); color: var(--text-main);">
                    ℹ️ Держите карту ровно под исследуемым светом.
                </div>

                <button id="captureCardBtn" class="btn-action" style="margin-bottom: 12px; width: 100%;">
                    📸 Замерить по карточке
                </button>
            </div>
        `;

        const videoEl = document.getElementById('cardLuxVideo');
        const canvasEl = document.getElementById('cardLuxCanvas');
        const valEl = document.getElementById('cardLuxValue');
        const modeEl = document.getElementById('cardLuxMode');
        const statusEl = document.getElementById('cardLuxStatus');
        const captureBtn = document.getElementById('captureCardBtn');

        if (!videoEl || !captureBtn) return;

        // Запуск камеры
        async function startCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                videoEl.srcObject = stream;
                await videoEl.play();
            } catch (err) {
                console.warn('Camera error:', err);
                statusEl.innerHTML = '⚠️ Ошибка доступа к камере.';
                statusEl.style.color = '#FF5252';
            }
        }
        startCamera();

        // Расчёт люксов по физическим патчам карточки
        function estimateLuxFromCard(white, grey, black) {
            // 1. Прямое солнце / Клиппинг
            if (white >= 254 && grey > 230) {
                return { lux: "> 10000", mode: "Прямое солнце / Пересвет" };
            }

            // 2. Детектор помещения по уровню чёрного патча (< 52)
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
                // 3. Улица / Тень / Терраса
                if (grey < 180) {
                    let outdoorLux = Math.round(1000 + ((grey - 160) / 20) * 2000);
                    return { lux: Math.max(1000, outdoorLux), mode: "Уличная тень / Навес" };
                } else {
                    let openLux = Math.round(3000 + ((grey - 180) / 25) * 7000);
                    return { lux: Math.min(9900, Math.max(3000, openLux)), mode: "Открытая терраса / Рассеянный свет" };
                }
            }
        }

        // Клик по кнопке замера
        captureBtn.onclick = () => {
            if (!videoEl.videoWidth) {
                statusEl.innerHTML = '⚠️ Камера ещё не инициализирована.';
                return;
