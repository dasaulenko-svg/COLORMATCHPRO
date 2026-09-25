// api/calibrate.js — Серверная функция на Vercel

export default async function handler(req, res) {
  // Разрешаем CORS-запросы с любого фронтенда
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { refTarget, samTarget, refPatches, samPatches } = req.body;

    if (!refTarget || !samTarget) {
      return res.status(400).json({ error: 'Missing color target data.' });
    }

    // 1. Расчет сырого совпадения (Raw RGB)
    const rawDelta = Math.round(Math.sqrt(
      Math.pow(refTarget.r - samTarget.r, 2) +
      Math.pow(refTarget.g - samTarget.g, 2) +
      Math.pow(refTarget.b - samTarget.b, 2)
    ));
    const rawMatchPercent = Math.max(0, Math.min(100, Math.round(100 - (rawDelta / 441.67) * 100)));

    // 2. Функция 1D коррекции цвета по плашкам
    function calibrateColor(rawTarget, patches) {
      if (!patches || !patches.white || !patches.gray || !patches.black) {
        return rawTarget;
      }

      const IDEAL = {
        white: { r: 255, g: 255, b: 255 },
        gray:  { r: 128, g: 128, b: 128 },
        black: { r: 20,  g: 20,  b: 20  }
      };

      function interpolateChannel(val, ch) {
        let pts = [
          { x: 0, y: 0 },
          { x: patches.black[ch], y: IDEAL.black[ch] },
          { x: patches.gray[ch],  y: IDEAL.gray[ch] },
          { x: patches.white[ch], y: IDEAL.white[ch] },
          { x: 255, y: 255 }
        ];

        pts.sort((a, b) => a.x - b.x);

        let clean = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          if (pts[i].x > clean[clean.length - 1].x) {
            clean.push(pts[i]);
          }
        }

        for (let i = 0; i < clean.length - 1; i++) {
          let p1 = clean[i], p2 = clean[i + 1];
          if (val >= p1.x && val <= p2.x) {
            let ratio = (val - p1.x) / (p2.x - p1.x);
            return Math.max(0, Math.min(255, Math.round(p1.y + ratio * (p2.y - p1.y))));
          }
        }
        return val < clean[0].x ? clean[0].y : clean[clean.length - 1].y;
      }

      return {
        r: interpolateChannel(rawTarget.r, 'r'),
        g: interpolateChannel(rawTarget.g, 'g'),
        b: interpolateChannel(rawTarget.b, 'b')
      };
    }

    // Вычисляем скорректированные цвета
    const corrRef = calibrateColor(refTarget, refPatches);
    const corrSam = calibrateColor(samTarget, samPatches);

    const corrDelta = Math.round(Math.sqrt(
      Math.pow(corrRef.r - corrSam.r, 2) +
      Math.pow(corrRef.g - corrSam.g, 2) +
      Math.pow(corrRef.b - corrSam.b, 2)
    ));
    const corrMatchPercent = Math.max(0, Math.min(100, Math.round(100 - (corrDelta / 441.67) * 100)));

    const isMatch = corrDelta < 15;
    const statusText = isMatch ? `ТОТ САМЫЙ ЦВЕТ (Δ = ${corrDelta})` : `СОВСЕМ НЕ ТОТ (Δ = ${corrDelta})`;

    return res.status(200).json({
      success: true,
      raw: {
        delta: rawDelta,
        matchPercent: rawMatchPercent
      },
      corrected: {
        refRgb: corrRef,
        samRgb: corrSam,
        delta: corrDelta,
        matchPercent: corrMatchPercent,
        isMatch: isMatch,
        statusText: statusText
      }
    });

  } catch (err) {
    return res.status(500).json({ error: 'Server calculation error', details: err.message });
  }
}
