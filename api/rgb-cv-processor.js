const fs = require('fs');
const path = require('path');

const IDEAL_PATCHES = {
    white: { r: 240, g: 240, b: 240 },
    gray: { r: 128, g: 128, b: 128 },
    black: { r: 20, g: 20, b: 20 }
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { targetRgb, measuredPatches } = req.body;

        if (!targetRgb) {
            return res.status(400).json({ success: false, error: 'No target RGB provided' });
        }

        const ralPath = path.join(process.cwd(), 'ral.json');
        let ralCatalog = [];
        if (fs.existsSync(ralPath)) {
            const ralData = JSON.parse(fs.readFileSync(ralPath, 'utf8'));
            ralCatalog = Object.values(ralData);
        }

        let correctedRgb = { ...targetRgb };

        if (measuredPatches && measuredPatches.white) {
            const mw = measuredPatches.white;
            const iw = IDEAL_PATCHES.white;
            
            const gainR = iw.r / Math.max(mw.r, 1);
            const gainG = iw.g / Math.max(mw.g, 1);
            const gainB = iw.b / Math.max(mw.b, 1);

            correctedRgb.r = Math.min(255, Math.max(0, Math.round(targetRgb.r * gainR)));
            correctedRgb.g = Math.min(255, Math.max(0, Math.round(targetRgb.g * gainG)));
            correctedRgb.b = Math.min(255, Math.max(0, Math.round(targetRgb.b * gainB)));
        } else {
            const maxCh = Math.max(targetRgb.r, targetRgb.g, targetRgb.b, 1);
            const gain = 255.0 / maxCh;
            correctedRgb.r = Math.min(255, Math.round(targetRgb.r * gain));
            correctedRgb.g = Math.min(255, Math.round(targetRgb.g * gain));
            correctedRgb.b = Math.min(255, Math.round(targetRgb.b * gain));
        }

        let closest = null;
        let minDist = Infinity;

        for (let item of ralCatalog) {
            if (!item.rgb_hex) continue;
            let hex = item.rgb_hex.replace('#', '');
            let r = parseInt(hex.substring(0, 2), 16);
            let g = parseInt(hex.substring(2, 4), 16);
            let b = parseInt(hex.substring(4, 6), 16);

            let dist = Math.sqrt(
                Math.pow(correctedRgb.r - r, 2) +
                Math.pow(correctedRgb.g - g, 2) +
                Math.pow(correctedRgb.b - b, 2)
            );

            if (dist < minDist) {
                minDist = dist;
                closest = item;
            }
        }

        return res.status(200).json({
            success: true,
            correctedRgb,
            match: closest ? {
                code: closest.code,
                name: closest.name,
                rgb_hex: closest.rgb_hex
            } : null
        });

    } catch (err) {
        console.error('rgb-cv-processor error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};
