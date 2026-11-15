(function (global) {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function formatSeconds(sec) {
    return `${Math.max(0, sec)}s`;
  }

  function renderScheduleFromConfig(cfg) {
    const p = cfg.programacao;
    const container = byId('schedule-content');
    if (!container) return;

    container.innerHTML = '';

    // Período header
    const periodEl = byId('schedule-period');
    if (periodEl) {
      periodEl.textContent = `${cfg.programa} · ${p.periodo}`;
    }

    // 1. Abertura
    const aberturaCard = document.createElement('section');
    aberturaCard.className = 'sched-card sched-card--highlight';
    const abTitle = document.createElement('h3');
    abTitle.textContent = `Abertura · ${p.abertura.data} (${p.abertura.weekday})`;
    const abMeta = document.createElement('p');
    abMeta.className = 'sched-meta';
    abMeta.textContent = `${p.abertura.hora} · ${p.abertura.local}`;
    const abList = document.createElement('ul');
    abList.className = 'sched-list';
    p.abertura.atracoes.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      abList.appendChild(li);
    });
    aberturaCard.appendChild(abTitle);
    aberturaCard.appendChild(abMeta);
    aberturaCard.appendChild(abList);
    container.appendChild(aberturaCard);

    // 2. Papai Noel
    const noelCard = document.createElement('section');
    noelCard.className = 'sched-card';
    const noelTitle = document.createElement('h3');
    noelTitle.textContent = 'Papai Noel';
    const noelText = document.createElement('p');
    noelText.textContent = p.papaiNoel;
    noelCard.appendChild(noelTitle);
    noelCard.appendChild(noelText);
    container.appendChild(noelCard);

    // 3. Primeira semana
    const weekCard = document.createElement('section');
    weekCard.className = 'sched-card';
    const weekTitle = document.createElement('h3');
    weekTitle.textContent = 'Primeira semana';
    weekCard.appendChild(weekTitle);

    p.primeiraSemana.forEach((day) => {
      const row = document.createElement('div');
      row.className = 'sched-day';

      const dateEl = document.createElement('strong');
      dateEl.className = 'sched-day-date';
      dateEl.textContent = day.data;

      const itemsEl = document.createElement('ul');
      itemsEl.className = 'sched-list';
      day.itens.forEach((txt) => {
        const li = document.createElement('li');
        li.textContent = txt;
        itemsEl.appendChild(li);
      });

      row.appendChild(dateEl);
      row.appendChild(itemsEl);
      weekCard.appendChild(row);
    });
    container.appendChild(weekCard);

    // 4. Destaques
    const destCard = document.createElement('section');
    destCard.className = 'sched-card';
    const destTitle = document.createElement('h3');
    destTitle.textContent = 'Destaques do período';
    const destList = document.createElement('ul');
    destList.className = 'sched-list';
    p.destaques.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      destList.appendChild(li);
    });
    destCard.appendChild(destTitle);
    destCard.appendChild(destList);
    container.appendChild(destCard);

    const footerSig = byId('schedule-signature');
    if (footerSig) {
      footerSig.textContent = cfg.assinatura;
    }
  }

  function init() {
    const cfg = global.CONFIG;
    const canvas = byId('game-canvas');
    const sound = new global.SoundEngine();
    const cardGen = new global.CardGenerator();

    // Populate static text from CONFIG
    byId('opening-title').textContent = cfg.titulo;
    byId('opening-program').textContent = cfg.programa;
    byId('opening-line').textContent = cfg.linha;
    byId('opening-slogan').textContent = cfg.sloganCidade;
    byId('opening-signature').textContent = cfg.assinatura;

    byId('card-campaign').textContent = cfg.linha;
    byId('card-period').textContent = cfg.programacao.linhaCard;
    byId('card-signature').textContent = cfg.assinatura;

    renderScheduleFromConfig(cfg);

    const screenOpening = byId('screen-opening');
    const screenCard = byId('screen-card');
    const screenSchedule = byId('screen-schedule');
    const hud = byId('hud');
    const btnSkip = byId('btn-skip');
    const transitionBanner = byId('transition-banner');
    const transitionText = byId('transition-text');
    const finaleBanner = byId('finale-banner');

    const hudPhaseTag = byId('hud-phase-tag');
    const hudPhaseName = byId('hud-phase-name');
    const hudLights = byId('hud-lights');
    const hudCombo = byId('hud-combo');
    const hudTimerWrap = byId('hud-timer-wrap');
    const hudTimer = byId('hud-timer');
    const hudTranquilTag = byId('hud-tranquil-tag');

    const btnSound = byId('btn-sound');
    const iconSoundOn = byId('icon-sound-on');
    const iconSoundOff = byId('icon-sound-off');
    const toastEl = byId('toast');
    let toastTimer = null;

    function showToast(msg) {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.classList.add('is-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastEl.classList.remove('is-visible');
      }, 3200);
    }

    function updateSoundButton() {
      const on = sound.isEnabled();
      btnSound.setAttribute('aria-pressed', on ? 'true' : 'false');
      btnSound.setAttribute('aria-label', on ? 'Desativar som' : 'Ativar som');
      iconSoundOn.style.display = on ? 'block' : 'none';
      iconSoundOff.style.display = on ? 'none' : 'block';
    }

    updateSoundButton();

    function syncScreens(state, snap) {
      screenOpening.hidden = state !== 'opening';
      screenCard.hidden = state !== 'card';

      const inPlay = state === 'playing' || state === 'transition';
      hud.hidden = !inPlay;
      btnSkip.hidden = !(state === 'playing' && snap.tranquil);

      transitionBanner.hidden = state !== 'transition';
      if (state === 'transition') {
        const suffix =
          snap.phaseName.startsWith('Praça') || snap.phaseName.startsWith('Estação')
            ? 'iluminada!'
            : 'iluminado!';
        transitionText.textContent = `${snap.phaseName} ${suffix}`;
      }

      finaleBanner.hidden = state !== 'finale';
    }

    function syncHUD(snap) {
      hudPhaseTag.textContent = `Fase ${snap.phaseIndex + 1}/${snap.phaseCount}`;
      hudPhaseName.textContent = snap.phaseName;
      hudLights.textContent = `${snap.phaseLightsLit} / ${snap.phaseLightsTotal} luzes`;

      if (snap.combo > 1) {
        hudCombo.hidden = false;
        hudCombo.textContent = `Combo x${snap.combo}`;
      } else {
        hudCombo.hidden = true;
      }

      if (snap.tranquil) {
        hudTimerWrap.hidden = true;
        hudTranquilTag.hidden = false;
      } else {
        hudTimerWrap.hidden = false;
        hudTranquilTag.hidden = true;
        hudTimer.textContent = formatSeconds(snap.phaseTimeLeft);
        hudTimerWrap.classList.toggle('is-urgent', snap.phaseTimeLeft <= 5);
      }
    }

    const game = new global.GameEngine({
      canvas: canvas,
      sound: sound,
      cardGen: cardGen,
      onStateChange: (state, snap) => {
        syncScreens(state, snap);
        syncHUD(snap);
      },
      onUIUpdate: (snap) => {
        syncHUD(snap);
      },
      onCardReady: (info) => {
        byId('card-headline').textContent = `Acendi a Estação Natal · ${info.lightsLit} luzes`;
        const preview = byId('card-preview');
        const fallback = byId('card-fallback');

        if (info.dataUrl) {
          preview.src = info.dataUrl;
          preview.hidden = false;
          fallback.hidden = true;
        } else {
          preview.hidden = true;
          fallback.hidden = false;
          byId('card-fallback-title').textContent = `Acendi a Estação Natal · ${info.lightsLit} luzes`;
        }
      },
    });

    // Resize listener
    let resizeRaf = null;
    function handleResize() {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => game.resize());
    }
    global.addEventListener('resize', handleResize);

    const btnStart = byId('btn-start');
    const btnTranquil = byId('btn-tranquil');
    const btnScheduleOpen = byId('btn-schedule-open');
    const btnReplay = byId('btn-replay');

    function unlockAudioOnGesture() {
      sound.unlock();
    }

    // Synchronous Web Audio unlock on first pointerdown/touchstart/click
    [btnStart, btnTranquil, canvas, btnSkip, btnReplay, btnScheduleOpen].forEach((el) => {
      if (!el) return;
      el.addEventListener('pointerdown', unlockAudioOnGesture, { passive: true });
      el.addEventListener('touchstart', unlockAudioOnGesture, { passive: true });
    });

    // Opening actions
    btnStart.addEventListener('click', () => {
      sound.unlock();
      game.startGame({ tranquil: false });
    });

    btnTranquil.addEventListener('click', () => {
      sound.unlock();
      game.startGame({ tranquil: true });
    });

    // Tranquil skip button
    btnSkip.addEventListener('click', () => {
      sound.unlock();
      game.skipPhase();
    });

    // Sound toggle: first gesture only unlocks & keeps sound ON; subsequent clicks toggle
    let soundBtnFirstUnlock = false;
    let soundBtnFirstUnlockAt = 0;

    function handleSoundBtnPointerDown() {
      if (!sound.hasAttemptedUnlock()) {
        soundBtnFirstUnlock = true;
        soundBtnFirstUnlockAt = Date.now();
      }
      sound.unlock();
    }

    btnSound.addEventListener('pointerdown', handleSoundBtnPointerDown, { passive: true });
    btnSound.addEventListener('touchstart', handleSoundBtnPointerDown, { passive: true });
    btnSound.addEventListener('pointercancel', () => {
      soundBtnFirstUnlock = false;
    });

    btnSound.addEventListener('click', () => {
      const wasFirstGesture =
        !sound.hasAttemptedUnlock() ||
        (soundBtnFirstUnlock && Date.now() - soundBtnFirstUnlockAt < 1500);
      soundBtnFirstUnlock = false;
      sound.unlock();
      if (wasFirstGesture) {
        sound.setEnabled(true);
      } else {
        sound.toggle();
      }
      updateSoundButton();
    });

    // Card actions
    byId('btn-download').addEventListener('click', async () => {
      const res = await cardGen.download('laco-de-luz.png');
      if (res.ok) {
        showToast('Card salvo como laco-de-luz.png');
      } else {
        showToast('Para baixar o card, abra via servidor local.');
      }
    });

    byId('btn-replay').addEventListener('click', () => {
      game.resetToOpening();
    });

    // Schedule modal controls
    let lastFocusBeforeSchedule = null;
    function openSchedule(trigger) {
      lastFocusBeforeSchedule = trigger || document.activeElement;
      screenSchedule.hidden = false;
      byId('btn-schedule-close').focus();
    }

    function closeSchedule() {
      screenSchedule.hidden = true;
      if (lastFocusBeforeSchedule && typeof lastFocusBeforeSchedule.focus === 'function') {
        lastFocusBeforeSchedule.focus();
      }
    }

    byId('btn-schedule-open').addEventListener('click', (e) => openSchedule(e.currentTarget));
    byId('btn-schedule-card').addEventListener('click', (e) => openSchedule(e.currentTarget));
    byId('btn-schedule-close').addEventListener('click', closeSchedule);

    global.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !screenSchedule.hidden) {
        closeSchedule();
      }
    });

    // Invisible test/debug hook (never exposed in UI)
    global.__DEBUG__ = {
      end: function () {
        return game.forceEndForTest();
      },
      getState: function () {
        return game.getSnapshot();
      },
      getTargets: function () {
        return game.targets.map((t) => ({
          id: t.id,
          x: t.screenX,
          y: t.screenY,
          r: t.screenR,
          lit: t.lit,
        }));
      },
      audio: function () {
        return sound.getDebugInfo();
      },
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
