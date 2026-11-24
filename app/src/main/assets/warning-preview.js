/*
 * Wire the existing "full-screen play" button to the REAL Android warning
 * renderer. The original source HTML and its editing controls are untouched.
 */
(() => {
  if (!window.Android || window.__godsengRealWarningReplay) return;
  const preview = document.getElementById('pv');
  if (!preview) return;
  window.__godsengRealWarningReplay = true;
  preview.addEventListener('click', event => {
    if (!event.target.closest('#pv-play')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (typeof T === 'undefined' || !T || typeof EK !== 'number' ||
        EK < 0 || EK > 3) return;
    const app = appOf(T.id);
    if (!app) return;
    const draft = document.getElementById('ed-in').value.trim() || DEF_MSG[EK];
    const request = {
      id: T.id,
      stage: EK,
      minutes: Number.isFinite(app.mins) ? app.mins : 0,
      cfg: {
        methods: [...T.methods],
        after: T.after,
        range: {...T.range},
        order: [...T.order],
        msg: {...T.msg, [EK]: draft},
        vib: T.vib !== false
      }
    };
    try {
      // No sandbox rendering: system notification at stage 0, actual Android
      // WindowManager overlay and ORIGINAL warning SVG/animation at stages 1-3.
      if (!Android.previewWarning(JSON.stringify(request))) {
        toast(EK === 0
          ? '알림 권한을 확인해 주세요'
          : '다른 앱 위에 표시 권한을 확인해 주세요');
      }
    } catch (error) {
      console.error('Native warning preview failed', error);
      toast('실제 경고를 열지 못했어요');
    }
  }, true);
})();
