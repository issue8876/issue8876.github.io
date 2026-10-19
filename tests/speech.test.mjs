import test from 'node:test';
import assert from 'node:assert/strict';
import { speechText, speechChunks, koreanVoice } from '../js/maeumgil-speech-core.js';
import { createSpeechReader } from '../js/maeumgil-speech.js';

test('Korean reading keeps sentence pauses and splits long replies into bounded chunks', () => {
  assert.equal(speechText('**AI** · 함께 해봐. https://example.com'), '에이아이 , 함께 해봐.');
  const text = '첫 문장부터 연습해 볼까? '.repeat(30);
  const chunks = speechChunks(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 85));
  assert.equal(chunks.join(' '), speechText(text));
  assert.deepEqual(speechChunks(''), []);
  assert.ok(speechChunks('가'.repeat(300)).every(chunk => chunk.length <= 85));
  assert.equal(koreanVoice([{lang:'en-US',name:'English Natural'},{lang:'ko-KR',name:'기본'},{lang:'ko-KR',name:'Korean Natural'}]).name, 'Korean Natural');
});

function harness() {
  const states = [], sources = [];
  const worker = { postMessage(message) { this.request=message; }, terminate() { this.terminated=true; } };
  const context = {
    currentTime:0,state:'running',destination:{},resume:async()=>{},close:async()=>{},
    createBuffer:(_channels,length,rate)=>({duration:length/rate,copyToChannel(){}}),
    createBufferSource() { const source={connect(){},disconnect(){},start(){},stop(){this.stopped=true;}}; sources.push(source); return source; },
    createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}),
  };
  const reader=createSpeechReader({onState:state=>states.push(state),makeWorker:()=>worker,makeContext:()=>context,synthesis:undefined});
  const emit=data=>worker.onmessage({data:{id:worker.request.id,...data}});
  return {reader,worker,states,sources,emit};
}

test('stopping model preparation discards late audio and terminates the worker', () => {
  const h=harness();
  h.reader.read('잠깐 쉬어도 돼.');
  const late=h.worker.onmessage, id=h.worker.request.id;
  h.reader.stop();
  late({data:{id,type:'audio',pcm:new Float32Array(100),sampleRate:44100}});
  assert.equal(h.worker.terminated,true);
  assert.equal(h.sources.length,0);
  assert.equal(h.reader.active,false);
  assert.equal(h.states.at(-1).state,'idle');
});

test('speech stays active until queued audio ends and stops all audio on navigation', () => {
  const h=harness();
  h.reader.read('하나씩 해보자.');
  h.emit({type:'audio',pcm:new Float32Array(100),sampleRate:44100});
  h.emit({type:'done'});
  assert.equal(h.reader.active,true);
  h.sources[0].onended();
  assert.equal(h.reader.active,false);
  h.reader.read('다시 해보자.');
  h.emit({type:'audio',pcm:new Float32Array(100),sampleRate:44100});
  h.reader.stop();
  assert.equal(h.sources[1].stopped,true);
  assert.equal(h.reader.active,false);
});

test('unsupported local speech falls back transparently and cancellation prevents the next sentence', () => {
  const spoken = [], states = [];
  const reader = createSpeechReader({
    onState:state=>states.push(state),makeContext:()=>{throw new Error('No AudioContext');},
    synthesis:{getVoices:()=>[{lang:'ko-KR',name:'Google 한국어'}],cancel(){},speak:utterance=>spoken.push(utterance)},
    makeUtterance:text=>({text}),
  });
  reader.read('첫 문장이야. 두 번째 문장이야.');
  assert.equal(spoken.length,1);
  assert.equal(spoken[0].voice.name,'Google 한국어');
  assert.match(states.at(-1).detail,/기본 목소리/);
  reader.stop(); spoken[0].onend();
  assert.equal(spoken.length,1);
  assert.equal(reader.active,false);
});
