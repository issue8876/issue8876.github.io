import test from 'node:test';
import assert from 'node:assert/strict';
import { readAPIResponse } from '../js/maeumgil-connection.js';

test('connection responses preserve valid API data but replace malformed proxy responses with recovery guidance', async () => {
  assert.deepEqual(await readAPIResponse(Response.json({ message: '답변', filtered: false })), { message: '답변', filtered: false });
  assert.deepEqual(await readAPIResponse(Response.json({ error: '다시 연결해 줘.' }, { status: 401 })), { error: '다시 연결해 줘.' });
  for (const body of ['Internal Error', '<html>upstream failure</html>', 'null', '[]', '"private upstream detail"']) {
    await assert.rejects(readAPIResponse(new Response(body, { status: 502 })), error => {
      assert.match(error.message, /다시 시도하거나 기본 활동/);
      assert.doesNotMatch(error.message, /Internal Error|upstream|private|Unexpected|JSON/);
      return true;
    });
  }
});
