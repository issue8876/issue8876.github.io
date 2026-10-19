export const profiles = {
  lower: { label: '초등 1–3학년', short: '쉽고 짧게' },
  upper: { label: '초등 4–6학년', short: '차근차근 함께' },
  middle: { label: '중학생', short: '내 속도에 맞게' },
  high: { label: '고등학생', short: '내 선택을 존중하며' },
};

// Educational wording preserved from 마음길 코치.yml; not a validated test edition.
export const questions = [
  "나는 평소에 내가 꽤 잘해 나가고 있다고 느낀다.",
  "어려운 일이 생기면 해결할 방법을 여러 가지 떠올릴 수 있다.",
  "나는 또래 친구들만큼 잘해 나가고 있다고 느낀다.",
  "내가 중요하게 생각하는 일을 해낼 방법을 생각해낼 수 있다.",
  "내가 지금까지 해본 일들은 앞으로 나에게 도움이 될 것 같다.",
  "다른 사람이 포기하고 싶어 할 때도 나는 다른 방법을 찾아볼 수 있다."
];
// Educational frequency labels, revised for consistency; not a standardized CHS edition.
export const scale = ['전혀 없어', '아주 드물어', '가끔 그래', '자주 그래', '거의 항상 그래', '항상 그래'];
export function summarizeCheck(answers) {
  if (!Array.isArray(answers) || answers.length !== 6 || Array.from(answers).some(x => !Number.isInteger(x) || x < 1 || x > 6)) {
    throw new Error('6개 문항에 모두 응답해야 합니다.');
  }
  const total = answers.reduce((a, b) => a + b, 0);
  const strongest = answers.indexOf(Math.max(...answers));
  const support = answers.indexOf(Math.min(...answers));
  const agency = answers[0] + answers[2] + answers[4];
  const pathways = answers[1] + answers[3] + answers[5];
  return { total, strongest, support, agency, pathways };
}

// A conservative local routing aid, not a complete risk assessment.
export function assessSafety(value) {
  const text = String(value).normalize('NFKC').replace(/[\s\u200b-\u200d·.,!?~ㅠㅜㅋㅎ]/g, '');
  if (/(죽고싶|죽고십|죽구싶|죽을래|죽어버|죽으려고|죽을거|자살|자해|목숨|살기싫|살고싶지|살아있기싫|없어지고싶|사라지고싶|(?:내가|난|나는).{0,2}사라졌으면|다신안깨고싶|눈뜨고싶지않|(?:삶|인생|모든걸|모든것).{0,3}끝내고싶|해치고싶|죽이고싶|죽일거|칼로|뛰어내|손목.{0,8}(긋|그었|베)|약.{0,5}(많이먹|한꺼번에))/.test(text)) return 'urgent';
  if (/(때려|때리|맞았|맞고|폭력|학대|성폭|성추행|만졌|만져|따돌|왕따|괴롭|집에가기무서|집에가면무서|협박|사진.{0,8}(퍼뜨린|뿌린)|옷.{0,5}벗으라)/.test(text)) return 'support';
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
  challenge: { label: '오늘 어려웠던 일', intro: '어떤 일이 어렵게 느껴졌어?', choices: ['처음 해보는 일', '해봐도 잘 안 되는 일', '도움이 필요한 일'], goals: ['해야 할 일 하나만 정하기', '전에 해본 쉬운 방법 다시 해보기', '도와줄 어른 한 명 떠올리기'] },
  study: { label: '공부·숙제', intro: '공부나 숙제에서 어느 때가 가장 어려워?', choices: ['시작하려고 할 때', '하다가 막혔을 때', '끝까지 하기 힘들 때'], goals: ['5분만 시작해 보기', '문제 한 개만 살펴보기', '어려운 부분 하나 표시하기'] },
  friend: { label: '친구 관계', intro: '친구와 어떤 일이 있었어?', choices: ['말 때문에 속상했어', '같이 지내기가 어려워', '내 마음을 전하고 싶어'], goals: ['내 마음을 한 문장으로 정리하기', '“나는 그때 속상했어” 연습하기', '믿을 수 있는 어른에게 이야기하기'] },
  worry: { label: '발표·시험 걱정', intro: '발표나 시험을 생각하면 어떤 게 가장 걱정돼?', choices: ['준비할 게 너무 많아', '틀리거나 실수할까 봐', '긴장이 잘 안 가라앉아'], goals: ['첫 문장만 작은 소리로 읽기', '준비할 것 한 가지 정하기', '편하게 숨을 세 번 내쉬기'] },
  mistake: { label: '실수·속상함', intro: '실수한 뒤에 어떤 생각이 남았어?', choices: ['자꾸 그 장면이 생각나', '다시 해도 안 될 것 같아', '다음에는 다르게 하고 싶어'], goals: ['다음에 바꿀 행동 한 가지 정하기', '전에 조금이라도 해낸 일 떠올리기', '물 한 모금 마시고 잠깐 쉬기'] },
};
