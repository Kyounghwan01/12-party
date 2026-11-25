// 기본 문제. 관리자 화면에서 수정할 수 있다. answer가 null이면 사전 설문의 다수 답이 정답이다.
export const defaults = [
  { text: 'PO 체제에서 우리 회사가 정한 핵심 역량은?', choices: ['속도', '소통', '경쟁', '보안'], answer: 1 },
  { text: '이 행사에서 말하는 PO는 무엇의 줄임말일까요?', choices: ['Public Office', 'Project Owner', 'Party Organizer', 'Power On'], answer: 1 },
  { text: '우리의 다수는? 연말 하면 떠오르는 음식', choices: ['치킨', '케이크', '고기', '피자'], answer: null },
  { text: '12월 31일의 다음 날은 무슨 날일까요?', choices: ['성탄절', '동지', '새해 첫날', '설날 연휴'], answer: 2 },
  { text: '오늘 레드팀과 그린팀의 조는 모두 몇 개일까요?', choices: ['5개', '8개', '10개', '12개'], answer: 2 },
  { text: '우리의 다수는? 급한 일이 생겼을 때 편한 연락 방법', choices: ['전화', '메신저', '직접 찾아가기', '이메일'], answer: null },
  { text: '한 해의 마지막 달은 며칠까지 있을까요?', choices: ['28일', '29일', '30일', '31일'], answer: 3 },
  { text: '우리의 다수는? 내년에 가장 바라는 것', choices: ['건강', '여행', '성장', '휴식'], answer: null },
];
