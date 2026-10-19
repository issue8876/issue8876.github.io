import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { createFirebaseHandler } from './handler.mjs';

const app = initializeApp();
const apiKey = defineSecret('GEMINI_API_KEY');
const joinCode = defineSecret('COACH_JOIN_CODE');
const signingKey = defineSecret('SESSION_SIGNING_KEY');
const appCheckSiteKey = defineString('APP_CHECK_SITE_KEY');

export const coachApi = onRequest({
  region: 'asia-northeast3', minInstances: 0, maxInstances: 1, concurrency: 20,
  timeoutSeconds: 60, memory: '256MiB', invoker: 'public',
  secrets: [apiKey, joinCode, signingKey],
}, createFirebaseHandler({
  getSettings: () => ({ projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT, apiKey: apiKey.value(), joinCode: joinCode.value(), signingKey: signingKey.value(), appCheckSiteKey: appCheckSiteKey.value() }),
  verifyAppCheck: token => getAppCheck(app).verifyToken(token),
}));
