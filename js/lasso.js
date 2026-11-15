(function (global) {
  'use strict';

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function segmentsIntersect(a, b, c, d) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const cdx = d.x - c.x;
    const cdy = d.y - c.y;
    const denom = abx * cdy - aby * cdx;
    if (Math.abs(denom) < 1e-6) return null;

    const acx = c.x - a.x;
    const acy = c.y - a.y;
    const t = (acx * cdy - acy * cdx) / denom;
    const u = (acx * aby - acy * abx) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: a.x + t * abx,
        y: a.y + t * aby,
      };
    }
    return null;
  }

  function computeWindingAngle(px, py, pts) {
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const ax = a.x - px;
      const ay = a.y - py;
      const bx = b.x - px;
      const by = b.y - py;
      const cross = ax * by - ay * bx;
      const dot = ax * bx + ay * by;
      total += Math.atan2(cross, dot);
    }
    return total;
  }

  function pointInClosedPolygon(px, py, poly) {
    if (!poly || poly.length < 3) return false;
    let windingNumber = 0;
    const n = poly.length;

    for (let i = 0; i < n; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % n];
      if (p1.y <= py) {
        if (p2.y > py && ((p2.x - p1.x) * (py - p1.y) - (px - p1.x) * (p2.y - p1.y)) > 0) {
          windingNumber++;
        }
      } else {
        if (p2.y <= py && ((p2.x - p1.x) * (py - p1.y) - (px - p1.x) * (p2.y - p1.y)) < 0) {
          windingNumber--;
        }
      }
    }
    return windingNumber !== 0;
  }

  function findSelfIntersectionLoops(pts) {
    const loops = [];
    const n = pts.length;
    if (n < 5) return loops;

    for (let i = 0; i < n - 3; i++) {
      for (let j = i + 2; j < n - 1; j++) {
        // Avoid adjacent wrap boundary on nearly closed paths
        if (i === 0 && j === n - 2) continue;
        const hit = segmentsIntersect(pts[i], pts[i + 1], pts[j], pts[j + 1]);
        if (hit) {
          const loopPoly = [hit];
          for (let k = i + 1; k <= j; k++) {
            loopPoly.push(pts[k]);
          }
          loops.push(loopPoly);
        }
      }
    }
    return loops;
  }

  class LassoController {
    constructor(canvas, callbacks) {
      this.canvas = canvas;
      this.callbacks = callbacks || {};
      this.active = false;
      this.pointerId = null;
      this.points = [];
      this.fadeTrails = [];
      this.enabled = false;
      this.boundDown = this._onDown.bind(this);
      this.boundMove = this._onMove.bind(this);
      this.boundUp = this._onUp.bind(this);
      this._attach();
    }

    _attach() {
      this.canvas.addEventListener('pointerdown', this.boundDown, { passive: false });
      this.canvas.addEventListener('pointermove', this.boundMove, { passive: false });
      this.canvas.addEventListener('pointerup', this.boundUp, { passive: false });
      this.canvas.addEventListener('pointercancel', this.boundUp, { passive: false });
    }

    destroy() {
      this.canvas.removeEventListener('pointerdown', this.boundDown);
      this.canvas.removeEventListener('pointermove', this.boundMove);
      this.canvas.removeEventListener('pointerup', this.boundUp);
      this.canvas.removeEventListener('pointercancel', this.boundUp);
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
      if (!this.enabled) {
        this.active = false;
        this.pointerId = null;
        this.points = [];
      }
    }

    _toCanvasPoint(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    _onDown(e) {
      if (!this.enabled) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();

      if (this.callbacks.onGestureStart) {
        this.callbacks.onGestureStart();
      }

      if (this.active) return;
      this.active = true;
      this.pointerId = e.pointerId;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch (_) {}

      const pt = this._toCanvasPoint(e);
      this.points = [pt];
    }

    _onMove(e) {
      if (!this.active || e.pointerId !== this.pointerId) return;
      e.preventDefault();

      const pt = this._toCanvasPoint(e);
      const last = this.points[this.points.length - 1];
      if (!last || dist(last, pt) >= 6) {
        this.points.push(pt);
        if (this.points.length > 420) {
          this.points.shift();
        }
      }
    }

    _onUp(e) {
      if (!this.active || e.pointerId !== this.pointerId) return;
      e.preventDefault();

      const pt = this._toCanvasPoint(e);
      const last = this.points[this.points.length - 1];
      if (!last || dist(last, pt) >= 3) {
        this.points.push(pt);
      }

      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch (_) {}

      const stroke = this.points.slice();
      this.active = false;
      this.pointerId = null;
      this.points = [];

      const result = this.evaluateStroke(stroke);
      if (stroke.length >= 2) {
        this.fadeTrails.push({
          points: stroke,
          life: 1,
          hit: result.hits.length > 0,
        });
      }

      if (this.callbacks.onLoopComplete) {
        this.callbacks.onLoopComplete(result);
      }
    }

    evaluateStroke(stroke, targetsOverride) {
      const targets = targetsOverride || (this.callbacks.getTargets ? this.callbacks.getTargets() : []);
      if (!stroke || stroke.length < 6) {
        return { isLoop: false, isTap: true, hits: [] };
      }

      let pathLength = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (let i = 0; i < stroke.length; i++) {
        const p = stroke[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        if (i > 0) pathLength += dist(stroke[i - 1], p);
      }

      const diag = Math.hypot(maxX - minX, maxY - minY);
      if (pathLength < 75 || diag < 26) {
        return { isLoop: false, isTap: true, hits: [] };
      }

      const endGap = dist(stroke[0], stroke[stroke.length - 1]);
      const closeThreshold = Math.max(72, Math.min(135, diag * 0.46));
      const subLoops = findSelfIntersectionLoops(stroke);
      const hasIntersection = subLoops.length > 0;
      const closeByGap = endGap <= closeThreshold;

      // Also treat near-full angular wrap (>= 295 deg) around any unlit target as a valid loop
      let highWinding = false;
      const openAngles = new Map();
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (t.lit) continue;
        const angle = computeWindingAngle(t.screenX, t.screenY, stroke);
        openAngles.set(t.id, angle);
        if (Math.abs(angle) >= 0.82 * 2 * Math.PI) {
          highWinding = true;
        }
      }

      const isLoop = hasIntersection || closeByGap || highWinding;
      if (!isLoop) {
        return { isLoop: false, isTap: false, hits: [] };
      }

      const hits = [];
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (t.lit) continue;

        let inside = false;
        if (closeByGap || highWinding) {
          if (pointInClosedPolygon(t.screenX, t.screenY, stroke)) {
            inside = true;
          }
        }
        if (!inside && hasIntersection) {
          for (let s = 0; s < subLoops.length; s++) {
            if (pointInClosedPolygon(t.screenX, t.screenY, subLoops[s])) {
              inside = true;
              break;
            }
          }
        }

        const angle = openAngles.has(t.id)
          ? openAngles.get(t.id)
          : computeWindingAngle(t.screenX, t.screenY, stroke);
        const turns = Math.abs(angle) / (2 * Math.PI);

        if (!inside && turns >= 0.82) {
          inside = true;
        }

        if (inside) {
          const wraps = turns >= 1.72 ? Math.min(5, Math.floor(turns + 0.28)) : 1;
          hits.push({
            target: t,
            wraps: Math.max(1, wraps),
          });
        }
      }

      return { isLoop: true, isTap: false, hits: hits };
    }

    getLiveEncircled(targets) {
      const map = new Map();
      if (!this.active || this.points.length < 6) return map;

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (t.lit) continue;
        const angle = computeWindingAngle(t.screenX, t.screenY, this.points);
        const turns = Math.abs(angle) / (2 * Math.PI);
        if (turns >= 0.72) {
          const wraps = turns >= 1.72 ? Math.min(5, Math.floor(turns + 0.28)) : 1;
          map.set(t.id, wraps);
        }
      }
      return map;
    }

    update(dt) {
      for (let i = this.fadeTrails.length - 1; i >= 0; i--) {
        this.fadeTrails[i].life -= dt * 3.4;
        if (this.fadeTrails[i].life <= 0) {
          this.fadeTrails.splice(i, 1);
        }
      }
    }

    _drawRopePath(ctx, pts, alpha, isHitTrail, time) {
      if (pts.length < 2) return;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const traceCurve = function () {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) * 0.5;
          const midY = (pts[i].y + pts[i + 1].y) * 0.5;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x, last.y);
      };

      // 1. Warm outer amber glow
      traceCurve();
      ctx.strokeStyle = isHitTrail
        ? `rgba(255, 224, 120, ${0.38 * alpha})`
        : `rgba(245, 158, 11, ${0.26 * alpha})`;
      ctx.lineWidth = isHitTrail ? 18 : 14;
      ctx.stroke();

      // 2. Golden braided rope body
      traceCurve();
      ctx.strokeStyle = isHitTrail
        ? `rgba(255, 232, 163, ${0.95 * alpha})`
        : `rgba(242, 198, 109, ${0.92 * alpha})`;
      ctx.lineWidth = 5.5;
      ctx.stroke();

      // 3. Rope twist core highlight
      traceCurve();
      ctx.setLineDash([7, 7]);
      ctx.lineDashOffset = -(time * 40);
      ctx.strokeStyle = `rgba(255, 249, 224, ${0.85 * alpha})`;
      ctx.lineWidth = 2.1;
      ctx.stroke();
      ctx.setLineDash([]);

      // 4. Tip ember on active draw
      if (alpha >= 0.99) {
        const tip = pts[pts.length - 1];
        const grad = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 16);
        grad.addColorStop(0, 'rgba(255, 252, 232, 0.95)');
        grad.addColorStop(0.45, 'rgba(245, 194, 78, 0.55)');
        grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 16, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    render(ctx, time) {
      for (let i = 0; i < this.fadeTrails.length; i++) {
        const trail = this.fadeTrails[i];
        this._drawRopePath(ctx, trail.points, Math.max(0, trail.life), trail.hit, time);
      }

      if (this.active && this.points.length >= 2) {
        this._drawRopePath(ctx, this.points, 1, false, time);
      }
    }
  }

  global.LassoController = LassoController;
})(window);
