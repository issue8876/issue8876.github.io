// Keep spoken wording close to the displayed reply; only remove visual markup.
export function speechText(value) {
  return String(value || '').normalize('NFC')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*#_`]/g, '')
    .replace(/\bAI\b/g, '에이아이')
    .replace(/[·•]/g, ', ')
    .replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ').trim().slice(0, 1600);
}

export function speechChunks(value, maxLength = 85) {
  const text = speechText(value);
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*/gu) || [];
  const chunks = [];
  for (let sentence of sentences) {
    sentence = sentence.trim();
    while (sentence.length > maxLength) {
      let end = sentence.lastIndexOf(' ', maxLength);
      if (end < maxLength / 2) end = maxLength;
      chunks.push(sentence.slice(0, end).trim());
      sentence = sentence.slice(end).trim();
    }
    if (sentence) {
      const previous = chunks.at(-1);
      // Let the model phrase short sentences together instead of restarting at every full stop.
      if (previous && previous.length + sentence.length + 1 <= maxLength) chunks[chunks.length - 1] += ` ${sentence}`;
      else chunks.push(sentence);
    }
  }
  return chunks;
}

export function koreanVoice(voices) {
  return voices.filter(voice => /^ko(?:[-_]|$)/i.test(voice.lang)).map((voice, index) => {
    let score = 0;
    if (/natural|neural|premium|enhanced/i.test(voice.name)) score += 100;
    if (/google.*한국|google.*korean/i.test(voice.name)) score += 60;
    if (/sunhi|sun-hi|yuna|유나/i.test(voice.name)) score += 20;
    if (voice.default) score += 1;
    return { voice, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index)[0]?.voice;
}
