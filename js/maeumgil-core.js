export const profiles = {
  lower: { label: '초등 1–3학년', short: '쉽고 짧게' },
  upper: { label: '초등 4–6학년', short: '차근차근 함께' },
  middle: { label: '중학생', short: '내 속도에 맞게' },
  high: { label: '고등학생', short: '내 선택을 존중하며' },
};

export const questions = [
  '나는 오늘 해볼 작은 일을 정할 수 있어요.',
  '어려운 일이 생기면 다른 방법을 생각해 볼 수 있어요.',
  '작은 일부터 시작할 수 있을 것 같아요.',
  '혼자 어렵다면 도움을 청할 사람을 떠올릴 수 있어요.',
  '전에 조금이라도 해낸 일이 생각나요.',
  '한 방법이 안 되면 다른 방법을 시도해 볼 수 있어요.',
];
export const scale = ['전혀 아니에요', '거의 아니에요', '조금 아니에요', '조금 그래요', '많이 그래요', '아주 그래요'];
export function summarizeCheck(answers) {
  if (!Array.isArray(answers) || answers.length !== 6 || answers.some(x => !Number.isInteger(x) || x < 1 || x > 6)) {
    throw new Error('6개 문항에 모두 응답해야 합니다.');
  }
  const total = answers.reduce((a, b) => a + b, 0);
  const strongest = answers.indexOf(Math.max(...answers));
  const support = answers.indexOf(Math.min(...answers));
  return { total, strongest, support };
}

// A conservative local routing aid, not a complete risk assessment.
export function assessSafety(value) {
  const text = String(value).normalize('NFKC').replace(/[\s\u200b-\u200d·.,!?~ㅠㅜㅋㅎ]/g, '');
  if (/(죽고싶|죽을래|죽어버|죽으려고|죽을거|자살|자해|목숨|살기싫|살고싶지|없어지고싶|사라지고싶|끝내고싶|해치고싶|죽이고싶|죽일거|칼로|뛰어내|손목.{0,8}(긋|그었|베)|약.{0,5}(많이먹|한꺼번에))/.test(text)) return 'urgent';
  if (/(때려|맞았|맞고|폭력|학대|성폭|성추행|만졌|만져|따돌|왕따|괴롭|집에가기무서|집에가면무서|협박)/.test(text)) return 'support';
  return null;
}
export const helpMessage = '지금은 네 안전이 가장 중요해. 혼자 견디지 않아도 돼. 너를 안전하게 도울 수 있는 선생님, 상담 선생님이나 믿을 수 있는 어른에게 지금 이 화면을 보여줘. 너를 해치는 사람에게 직접 도움을 청할 필요는 없어. 당장 위험하면 112 또는 119에 도움을 요청해. 자살예방상담전화 109에서도 이야기를 나눌 수 있어.';
export function redactPII(value) {
  return String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일 가림]')
    .replace(/(?:\+82[- .]?)?0?1[016789][- .]?\d{3,4}[- .]?\d{4}/g, '[전화번호 가림]')
    .replace(/\d{6}\s*[-]\s*[1-8]\d{6}/g, '[주민번호 가림]')
    .replace(/[가-힣A-Za-z0-9]+(?:초등학교|중학교|고등학교)/g, '[학교 이름 가림]')
    .replace(/(?:제|내)\s*이름은\s*[가-힣]{2,4}/g, '내 이름은 [이름 가림]')
    .replace(/[가-힣0-9]+(?:로|길)\s*\d+(?:-\d+)?(?:\s*\d+동\s*\d+호)?/g, '[주소 가림]');
}
export function safeModelText(value) {
  const text = redactPII(value).trim();
  if (!text || text.length > 2400 || assessSafety(text) || /(비밀로.{0,8}(해줄|지킬)|아무에게도.{0,8}말하지|너는.{0,6}(우울증|정신병)|약을.{0,8}(먹어|끊어)|시스템\s*프롬프트|system\s*prompt|https?:\/\/|[가-힣]*병으로\s*진단|성관계.{0,8}방법|죽이[는기].{0,8}(방법|순서)|자해.{0,8}(방법|순서))/i.test(text)) return null;
  return text;
}
export const topics = {
  daily: { label: '가벼운 이야기', emoji: '💬', intro: '어떤 걸 골라볼까?', choices: ['좋아하는 것 고르기', '쉬는 시간 상상하기', '잠깐 쉬기'], goals: ['좋아하는 노래 한 곡 듣기', '창밖을 보며 잠깐 쉬기', '좋아하는 놀이 잠깐 하기'] },
  study: { label: '공부·숙제', emoji: '✏️', intro: '공부나 숙제에서 어떤 게 제일 어려워?', choices: ['시작이 어려워', '어디부터 할지 모르겠어', '도움을 받고 싶어'], goals: ['책을 펴고 첫 줄 읽기', '문제 한 개만 살펴보기', '어려운 부분 하나 표시하기'] },
  friend: { label: '친구 관계', emoji: '💬', intro: '친구랑 무슨 일이 있었어? 어떻게 말해야 할지 모르겠으면 아래에서 골라 줘.', choices: ['내 마음부터 정리할래', '친구에게 할 말을 찾을래', '어른에게 도움을 청할래'], goals: ['내 마음을 한 문장으로 적기', '“나는 그때 속상했어” 연습하기', '믿을 수 있는 어른에게 이야기하기'] },
  worry: { label: '발표·걱정', emoji: '☁️', intro: '뭐가 제일 걱정돼? 말하기 전에 잠깐 숨을 고르거나 조금 연습해 봐도 좋아.', choices: ['잠깐 마음을 가라앉힐래', '아주 조금 연습할래', '걱정을 말로 꺼낼래'], goals: ['첫 문장만 작은 소리로 읽기', '준비할 것 한 가지 적기', '편하게 숨을 세 번 내쉬기'] },
  mistake: { label: '실수·속상함', emoji: '🌿', intro: '어떤 실수를 했는지 이야기하고 싶어? 아니면 다음에 어떻게 할지 같이 생각해 볼까?', choices: ['속상한 마음을 말할래', '다음 방법을 찾아볼래', '잠깐 쉬고 싶어'], goals: ['다음에 바꿀 행동 한 가지 적기', '나에게 다정한 말 한 문장 하기', '물 한 모금 마시고 잠깐 쉬기'] },
};
