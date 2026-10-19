import { config } from './maeumgil-config.js';

let appCheckPromise;
async function within(task, ms = 20000) {
  let timeout;
  try { return await Promise.race([task, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Connection timed out')), ms); })]); }
  finally { clearTimeout(timeout); }
}
async function getFirebaseAppCheck() {
  if (!appCheckPromise) {
    appCheckPromise = (async () => {
      const [initial, settings] = await Promise.all([fetch('/__/firebase/init.json', { signal: AbortSignal.timeout(15000) }), fetch('/api/config', { signal: AbortSignal.timeout(15000) })]);
      if (!initial.ok || !settings.ok) throw new Error('아직 연결 설정을 준비하고 있어. 기본 활동은 계속할 수 있어.');
      const [firebaseConfig, publicConfig] = await Promise.all([initial.json(), settings.json()]);
      if (!firebaseConfig.projectId || !firebaseConfig.appId || !publicConfig.appCheckSiteKey) throw new Error('연결 설정이 비어 있어. 선생님께 알려 줘.');
      const [{ initializeApp }, { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/13.0.0/firebase-app-check.js'),
      ]);
      const app = initializeApp(firebaseConfig);
      const appCheck = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(publicConfig.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
      return { appCheck, getToken };
    })().catch(error => { appCheckPromise = null; throw error; });
  }
  return appCheckPromise;
}

export async function apiHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (config.firebase) {
    try { const { appCheck, getToken } = await within(getFirebaseAppCheck()); headers['X-Firebase-AppCheck'] = (await within(getToken(appCheck, false))).token; }
    catch { throw new Error('이 화면에서 연결을 확인하지 못했어. 새로고침한 뒤 다시 해 줘.'); }
  }
  return headers;
}
