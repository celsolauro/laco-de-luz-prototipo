(function (global) {
  'use strict';

  const CARD_WIDTH = 1080;
  const CARD_HEIGHT = 1920;

  function drawCoverImage(ctx, img, w, h) {
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    const scale = Math.max(w / imgW, h / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const dx = (w - drawW) * 0.5;
    const dy = (h - drawH) * 0.5;
    ctx.drawImage(img, dx, dy, drawW, drawH);
  }

  function drawFourPointStar(ctx, cx, cy, outerR, innerR, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4 - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function fitTextSize(ctx, text, fontFamily, weight, maxFontSize, minFontSize, maxWidth) {
    let size = maxFontSize;
    while (size > minFontSize) {
      ctx.font = `${weight} ${size}px ${fontFamily}`;
      if (ctx.measureText(text).width <= maxWidth) {
        return size;
      }
      size -= 2;
    }
    return minFontSize;
  }

  class CardGenerator {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = CARD_WIDTH;
      this.canvas.height = CARD_HEIGHT;
      this.ctx = this.canvas.getContext('2d');
      this.lastDataUrl = null;
    }

    async ensureFonts() {
      if (!document.fonts || !document.fonts.ready) return;
      try {
        await Promise.all([
          document.fonts.load('700 48px "Cinzel Decorative"'),
          document.fonts.load('400 32px "Source Sans 3"'),
          document.fonts.load('600 32px "Source Sans 3"'),
          document.fonts.ready,
        ]);
      } catch (_) {}
    }

    async render(options) {
      const cfg = global.CONFIG;
      const lightsLit = Math.max(0, Number(options.lightsLit || 0));
      const backdropImg = options.backdropImg;

      await this.ensureFonts();

      const ctx = this.ctx;
      ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

      // Base midnight fallback
      ctx.fillStyle = '#060d1f';
      ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

      // 1. Illuminated scene backdrop
      if (backdropImg && (backdropImg.complete || backdropImg.naturalWidth > 0)) {
        drawCoverImage(ctx, backdropImg, CARD_WIDTH, CARD_HEIGHT);
      }

      // 2. Warm star glow on the sheriff star of Fase 1 (or high focal glow)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const starX = CARD_WIDTH * 0.54;
      const starY = CARD_HEIGHT * 0.415;
      const starGlow = ctx.createRadialGradient(starX, starY, 10, starX, starY, 260);
      starGlow.addColorStop(0, 'rgba(255, 240, 185, 0.55)');
      starGlow.addColorStop(0.35, 'rgba(245, 190, 75, 0.24)');
      starGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = starGlow;
      ctx.beginPath();
      ctx.arc(starX, starY, 260, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 3. Top and bottom cinematic midnight-blue gradients for WCAG legibility
      const topGrad = ctx.createLinearGradient(0, 0, 0, 560);
      topGrad.addColorStop(0, 'rgba(5, 11, 28, 0.94)');
      topGrad.addColorStop(0.58, 'rgba(6, 13, 31, 0.78)');
      topGrad.addColorStop(1, 'rgba(6, 13, 31, 0)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, CARD_WIDTH, 560);

      const botGrad = ctx.createLinearGradient(0, 1400, 0, CARD_HEIGHT);
      botGrad.addColorStop(0, 'rgba(6, 13, 31, 0)');
      botGrad.addColorStop(0.42, 'rgba(6, 13, 31, 0.80)');
      botGrad.addColorStop(1, 'rgba(4, 9, 24, 0.96)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, 1400, CARD_WIDTH, CARD_HEIGHT - 1400);

      // 4. Ornamental double hairline border + corner details
      ctx.save();
      ctx.strokeStyle = 'rgba(242, 198, 109, 0.42)';
      ctx.lineWidth = 2;
      ctx.strokeRect(36, 36, CARD_WIDTH - 72, CARD_HEIGHT - 72);

      ctx.strokeStyle = 'rgba(242, 198, 109, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(50, 50, CARD_WIDTH - 100, CARD_HEIGHT - 100);

      // Corner stars
      const corners = [
        [50, 50],
        [CARD_WIDTH - 50, 50],
        [50, CARD_HEIGHT - 50],
        [CARD_WIDTH - 50, CARD_HEIGHT - 50],
      ];
      corners.forEach(([cx, cy]) => {
        drawFourPointStar(ctx, cx, cy, 11, 3.5, 'rgba(242, 198, 109, 0.75)');
      });
      ctx.restore();

      // 5. Header lockup
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Program kicker
      ctx.fillStyle = 'rgba(245, 224, 174, 0.88)';
      ctx.font = '600 26px "Source Sans 3", sans-serif';
      const kicker = cfg.programa.toUpperCase();
      ctx.fillText(kicker, CARD_WIDTH / 2, 128);

      // Thin ornamental line under kicker
      ctx.strokeStyle = 'rgba(242, 198, 109, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(CARD_WIDTH / 2 - 190, 162);
      ctx.lineTo(CARD_WIDTH / 2 - 22, 162);
      ctx.moveTo(CARD_WIDTH / 2 + 22, 162);
      ctx.lineTo(CARD_WIDTH / 2 + 190, 162);
      ctx.stroke();
      drawFourPointStar(ctx, CARD_WIDTH / 2, 162, 10, 3, '#f2c66d');

      // Main Headline: "Acendi a Estação Natal · [N] luzes"
      const headline = `Acendi a Estação Natal · ${lightsLit} luzes`;
      const headlineSize = fitTextSize(
        ctx,
        headline,
        '"Cinzel Decorative", Georgia, serif',
        '700',
        48,
        30,
        CARD_WIDTH - 140
      );

      ctx.save();
      ctx.font = `700 ${headlineSize}px "Cinzel Decorative", Georgia, serif`;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;

      const goldGrad = ctx.createLinearGradient(0, 210, 0, 275);
      goldGrad.addColorStop(0, '#fff3c4');
      goldGrad.addColorStop(0.5, '#f2c66d');
      goldGrad.addColorStop(1, '#d69c38');
      ctx.fillStyle = goldGrad;
      ctx.fillText(headline, CARD_WIDTH / 2, 240);
      ctx.restore();

      // Campaign line
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#f8f2e4';
      ctx.font = '600 34px "Source Sans 3", sans-serif';
      ctx.fillText(cfg.linha, CARD_WIDTH / 2, 314);
      ctx.restore();

      // 6. Footer lockup
      ctx.strokeStyle = 'rgba(242, 198, 109, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(CARD_WIDTH / 2 - 240, 1690);
      ctx.lineTo(CARD_WIDTH / 2 - 24, 1690);
      ctx.moveTo(CARD_WIDTH / 2 + 24, 1690);
      ctx.lineTo(CARD_WIDTH / 2 + 240, 1690);
      ctx.stroke();
      drawFourPointStar(ctx, CARD_WIDTH / 2, 1690, 9, 2.8, '#f2c66d');

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 10;

      const linhaCard = cfg.programacao.linhaCard;
      const linhaCardSize = fitTextSize(
        ctx,
        linhaCard,
        '"Source Sans 3", sans-serif',
        '600',
        31,
        22,
        CARD_WIDTH - 140
      );
      ctx.fillStyle = '#f5ce78';
      ctx.font = `600 ${linhaCardSize}px "Source Sans 3", sans-serif`;
      ctx.fillText(linhaCard, CARD_WIDTH / 2, 1748);

      const assinaturaSize = fitTextSize(
        ctx,
        cfg.assinatura,
        '"Source Sans 3", sans-serif',
        '400',
        26,
        20,
        CARD_WIDTH - 140
      );
      ctx.fillStyle = 'rgba(243, 237, 224, 0.88)';
      ctx.font = `400 ${assinaturaSize}px "Source Sans 3", sans-serif`;
      ctx.fillText(cfg.assinatura, CARD_WIDTH / 2, 1806);
      ctx.restore();

      try {
        this.lastDataUrl = this.canvas.toDataURL('image/png');
        return { dataUrl: this.lastDataUrl, tainted: false };
      } catch (err) {
        this.lastDataUrl = null;
        return { dataUrl: null, tainted: true, error: err };
      }
    }

    download(filename) {
      const name = filename || 'laco-de-luz.png';
      return new Promise((resolve) => {
        try {
          if (typeof this.canvas.toBlob === 'function') {
            this.canvas.toBlob((blob) => {
              if (!blob) {
                resolve(this._downloadViaDataUrl(name));
                return;
              }
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = name;
              link.rel = 'noopener';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              setTimeout(() => URL.revokeObjectURL(url), 4000);
              resolve({ ok: true, method: 'blob' });
            }, 'image/png');
            return;
          }
        } catch (_) {
          // Fall through to dataURL fallback
        }
        resolve(this._downloadViaDataUrl(name));
      });
    }

    _downloadViaDataUrl(name) {
      try {
        const dataUrl = this.lastDataUrl || this.canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = name;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return { ok: true, method: 'dataurl' };
      } catch (err) {
        return { ok: false, error: err };
      }
    }
  }

  global.CardGenerator = CardGenerator;
})(window);
