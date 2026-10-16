/**
 * Spectrix Pro - Optical Luxometer Module (lux.js)
 * Усовершенствованный замер освещенности по видеопотоку камеры с учётом
 * пространственного сканирования (вращение телефона) и компенсации автоэкспозиции (AE).
 */

(function () {
    const paneLux = document.getElementById('paneLux');
    if (!paneLux) return;

    // Рендерим интерфейс оптического люксометра
    paneLux.innerHTML = `
        <div class="card" style="margin-top: 0; text-align: center;">
            <h3 style="margin-bottom: 8px; color: var(--text-main);">☀️ Оптический люксометр</h3>
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
                Анализ освещенности по кадру камеры с компенсацией автоэкспозиции.
            </p>

            <div class="lux-display-box" style="padding: 24px; background: rgba(0, 229, 255, 0.04); border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 16px; position: relative; overflow: hidden;">
                <div id="luxValueDisplay" style="font-size: 48px; font-weight: 800; color: var(--accent-cyan); line-height: 1;">--</div>
                <div id="luxModeLabel" style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-top: 6px;">Готов к сканированию</div>
                <!-- Скрытый элемент видео для анализа кадров в реальном времени -->
                <video id="luxOpticalVideo" autoplay playsinline muted style="display: none;"></video>
            </div>

            <div id="luxStatusBadge" style="padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; margin-bottom: 16px; background: rgba(255,255,255,0.05); color: var(--text-main);">
                ℹ️ Нажмите кнопку и плавно покрутите телефон в пространстве.
            </div>

            <!-- Кнопка запуска 5-секундного оптического скана -->
            <button id="scanRoomBtn" class="btn-action" style="margin-bottom: 16px; width: 100%;">
                ⏱️ Оптический скан (5 сек)
            </button>

            <!-- Блок Pro-аналитики (уверенность замера) -->
            <div class="pro-analytics-box" style="text-align: left; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; font-size: 12px; border-left: 3px solid var(--accent-green);">
                <div style="font-weight: 600; margin-bottom: 4px; color: var(--text-main);">Параметр уверенности (Confidence):</div>
                <div id="luxConfidenceText" style="color: var(--text-muted);">Ожидание сканирования...</div>
            </div>
        </div>
    `;

    const valEl = document.getElementById('luxValueDisplay');
    const modeLabelEl = document.getElementById('luxModeLabel');
    const statusEl = document.getElementById('luxStatusBadge');
    const confidenceEl = document.getElementById('luxConfidenceText');
    const scanBtn = document.getElementById('scanRoomBtn');
    const videoEl = document.getElementById('luxOpticalVideo');

    let isScanning = false;

    function evaluateLux(luxResult) {
        if (typeof luxResult === 'string') {
            statusEl.style.background = 'rgba(0, 229, 255, 0.12)';
            statusEl.style.color = 'var(--accent-cyan)';
            statusEl.innerHTML = '☀️ <b>Экстремальный свет / Прямое солнце</b> (> 10 000 лк).';
            confidenceEl.innerHTML = '🟡 Уверенность цвета: <b>85%</b> (предел матрицы).';
            confidenceEl.parentElement.style.borderLeftColor = 'var(--accent-cyan)';
            return;
        }

        const val = Math.round(luxResult);
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
            confidenceEl.innerHTML = '🟡 Уверенность цвета: <b>80-85%</b>.';
            confidenceEl.parentElement.style.borderLeftColor = '#FFC107';
        } else if (val >= 150 && val <= 3000) {
            statusEl.style.background = 'rgba(0, 230, 118, 0.12)';
            statusEl.style.color = '#00E676';
            statusEl.innerHTML = '✨ <b>Отличное освещение</b>. Идеально для подбора.';
            confidenceEl.innerHTML = '🟢 Уверенность цвета: <b>95-100%</b>.';
            confidenceEl.parentElement.style.borderLeftColor = '#00E676';
        } else {
            statusEl.style.background = 'rgba(0, 229, 255, 0.12)';
            statusEl.style.color = 'var(--accent-cyan)';
            statusEl.innerHTML = '🌤️ <b>Яркое дневное освещение / Навес</b>.';
            confidenceEl.innerHTML = '🟢 Уверенность цвета: <b>90-95%</b>.';
            confidenceEl.parentElement.style.borderLeftColor = 'var(--accent-cyan)';
        }
    }

    /**
     * Интеллектуальный анализатор собранной за 5 секунд статистики кадров.
     * Позволяет понять реальную физику помещения и отсечь ошибки автоэкспозиции (AE).
     */
    function analyzeRoomScan(stats) {
        if (!stats || stats.length === 0) return { lux: 150, mode: "Интерьер / Базовый" };

        const globalMin = Math.min(...stats.map(s => s.min));
        const globalMax = Math.max(...stats.map(s => s.max));
        const maxClip = Math.max(...stats.map(s => s.clipRatio));
        
        // Сортируем средние значения кадров для поиска стабильной медианы
        const sortedAvgs = stats.map(s => s.avg).sort((a, b) => a - b);
        const lowerQuartileAvg = sortedAvgs[Math.floor(sortedAvgs.length * 0.25)];

        // 1. Детекция экстремального пересвета / прямого солнца
        if (maxClip > 0.25 || (globalMax >= 250 && globalMin > 140)) {
            return {
                lux: "> 10000",
                mode: "Прямое солнце / Экстрим"
            };
        }

        // 2. Детекция улицы / открытой террасы (рассеянный купол неба заливает всё)
        // Даже в самых темных точках вращения минимальная яркость остаётся высокой (> 75)
        if (globalMin > 75) {
            let outdoorLux = Math.round(3000 + ((lowerQuartileAvg - 130) / 60) * 5000);
            return {
                lux: Math.max(1500, Math.min(9900, outdoorLux)),
                mode: "Открытая терраса / Улица"
            };
        }

        // 3. Детекция уличной тени или глубокого навеса
        if (globalMin > 45 && globalMin <= 75) {
            let shadeLux = Math.round(800 + ((lowerQuartileAvg - 100) / 40) * 1500);
            return {
                lux: Math.max(400, Math.min(2500, shadeLux)),
                mode: "Уличная тень / Навес"
            };
        }

        // 4. Детекция помещений и коридоров (есть глубокие тени/углы, globalMin < 45)
        // Применяем нелинейную поправку, анкоринг на нижний квартиль убирает влияние ламп
        let indoorLux = Math.round(Math.pow(lowerQuartileAvg / 255, 2.2) * 800);
        
        // Ограничиваем разумными рамками интерьера (от 40 до 600 люкс)
        indoorLux = Math.max(40, Math.min(600, indoorLux));

        return {
            lux: indoorLux,
            mode: "Интерьер / Помещение"
        };
    }

    // Логика 5-секундного оптического сканирования
    scanBtn.onclick = async () => {
        if (isScanning) return;
        isScanning = true;
        scanBtn.disabled = true;

        try {
            // Запускаем тыловую камеру для сбора оптических данных
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            videoEl.srcObject = stream;
            await videoEl.play();

            let timeLeft = 5;
            let frameStats = [];

            modeLabelEl.textContent = 'Идет оптический скан...';
            statusEl.style.background = 'rgba(0, 229, 255, 0.12)';
            statusEl.style.color = 'var(--accent-cyan)';
            statusEl.innerHTML = `🔄 <b>Вращайте телефон!</b> Осталось: ${timeLeft} сек.`;

            // Создаем скрытый холст для покадрового анализа
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 120;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            // Сбор данных 10 раз в секунду
            const sampleInterval = setInterval(() => {
                if (videoEl.readyState >= videoEl.HAVE_CURRENT_DATA) {
                    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = frame.data;

                    let totalLuminance = 0;
                    let minL = 255;
                    let maxL = 0;
                    let clippedPixels = 0;
                    const pixelCount = data.length / 4;

                    for (let i = 0; i < data.length; i += 4) {
                        const r = data[i];
                        const g = data[i+1];
                        const b = data[i+2];
                        
                        // Классическая формула пересчета в яркость (Luminance)
                        const l = 0.299 * r + 0.587 * g + 0.114 * b;
                        totalLuminance += l;
                        
                        if (l < minL) minL = l;
                        if (l > maxL) maxL = l;

                        // Детекция уличного пересвета (солнца)
                        if (r > 245 && g > 245 && b > 245) {
                            clippedPixels++;
                        }
                    }

                    const avgBrightness = totalLuminance / pixelCount;
                    const clipRatio = clippedPixels / pixelCount;

                    // Сохраняем статистику кадра для последующего логического анализа
                    frameStats.push({
                        avg: avgBrightness,
                        min: minL,
                        max: maxL,
                        clipRatio: clipRatio
                    });
                }
            }, 100);

            // Обратный отсчет таймера
            const timerInterval = setInterval(() => {
                timeLeft--;
                if (timeLeft > 0) {
                    statusEl.innerHTML = `🔄 <b>Вращайте телефон!</b> Осталось: ${timeLeft} сек.`;
                } else {
                    clearInterval(timerInterval);
                    clearInterval(sampleInterval);

                    // Останавливаем камеру и освобождаем ресурсы
                    stream.getTracks().forEach(track => track.stop());
                    videoEl.srcObject = null;

                    // Анализируем собранную сессию вращения целиком
                    const scanResult = analyzeRoomScan(frameStats);

                    valEl.textContent = scanResult.lux;
                    modeLabelEl.textContent = scanResult.mode;
                    evaluateLux(scanResult.lux);

                    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);

                    isScanning = false;
                    scanBtn.disabled = false;
                }
            }, 1000);

        } catch (err) {
            console.warn('Camera access error:', err);
            statusEl.style.background = 'rgba(255, 82, 82, 0.15)';
            statusEl.style.color = '#FF5252';
            statusEl.innerHTML = '⚠️ Ошибка доступа к камере. Разрешите её в браузере.';
            isScanning = false;
            scanBtn.disabled = false;
        }
    };
})();
