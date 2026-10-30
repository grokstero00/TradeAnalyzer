CCNA.registerDay({
  day: 15,
  title: 'Subnetting (Part 2)',
  titleRu: 'Сабнеттинг, часть 2',
  topics: ['Subnetting Class B networks', 'Subnetting Class A networks', 'Identifying the subnet of a host'],
  questions: [
    {
      id: 'd15-01',
      type: 'single',
      question: '172.16.0.0/16 is divided into /20 subnets. How many subnets are created, and how many usable hosts does each have?',
      options: ['16 subnets, 4094 hosts', '16 subnets, 4096 hosts', '4 subnets, 16382 hosts', '256 subnets, 254 hosts'],
      answer: 0,
      explanation: 'Заимствовано 4 бита: 2^4 = 16 подсетей. Хостовых бит 12: 2^12 − 2 = 4094.',
    },
    {
      id: 'd15-02',
      type: 'single',
      question: 'What is the subnet address of host 172.16.77.5/20?',
      options: ['172.16.64.0', '172.16.72.0', '172.16.76.0', '172.16.77.0'],
      answer: 0,
      explanation: '/20: интересный октет — третий, шаг 16 (0, 16, 32, 48, 64, 80…). 77 попадает в 64–79 → подсеть 172.16.64.0/20.',
    },
    {
      id: 'd15-03',
      type: 'single',
      question: 'What is the broadcast address of the subnet that contains 172.16.77.5/20?',
      options: ['172.16.77.255', '172.16.79.255', '172.16.80.255', '172.16.255.255'],
      answer: 1,
      explanation: 'Подсеть 172.16.64.0/20 тянется до начала следующей (172.16.80.0), значит broadcast 172.16.79.255.',
    },
    {
      id: 'd15-04',
      type: 'single',
      question: 'Which dotted-decimal mask corresponds to /22?',
      options: ['255.255.248.0', '255.255.252.0', '255.255.254.0', '255.255.255.252'],
      answer: 1,
      explanation: '/22 = 8 + 8 + 6 бит: в третьем октете 11111100 = 252. Маска 255.255.252.0.',
    },
    {
      id: 'd15-05',
      type: 'single',
      question: '10.0.0.0/8 is divided into /12 subnets. How many subnets are created?',
      options: ['4', '12', '16', '4096'],
      answer: 2,
      explanation: 'Заимствовано 12 − 8 = 4 бита: 2^4 = 16 подсетей (10.0.0.0, 10.16.0.0, 10.32.0.0 …).',
    },
    {
      id: 'd15-06',
      type: 'single',
      question: 'What is the subnet address of host 10.130.5.5/10?',
      options: ['10.0.0.0', '10.64.0.0', '10.128.0.0', '10.130.0.0'],
      answer: 2,
      explanation: '/10: интересный октет — второй, шаг 64 (0, 64, 128, 192). 130 попадает в 128–191 → 10.128.0.0/10.',
    },
    {
      id: 'd15-07',
      type: 'single',
      question: 'Which subnet contains the host 172.30.130.17/18?',
      options: ['172.30.0.0/18', '172.30.64.0/18', '172.30.128.0/18', '172.30.130.0/18'],
      answer: 2,
      explanation: '/18: шаг в третьем октете 64 (0, 64, 128, 192). 130 → 128.',
    },
    {
      id: 'd15-08',
      type: 'single',
      question: 'How many usable host addresses are in a /23 subnet?',
      options: ['254', '510', '512', '1022'],
      answer: 1,
      explanation: '9 хостовых бит: 2^9 − 2 = 510.',
    },
    {
      id: 'd15-09',
      type: 'single',
      question: 'Each subnet of 172.16.0.0/16 must support 500 hosts. Which prefix provides the most subnets while meeting the requirement?',
      options: ['/22', '/23', '/24', '/25'],
      answer: 1,
      explanation: '/24 даёт только 254 хоста. /23 даёт 510 ≥ 500 и больше подсетей, чем /22.',
    },
    {
      id: 'd15-10',
      type: 'single',
      question: 'What is the last usable host address of the subnet 172.16.32.0/19?',
      options: ['172.16.47.254', '172.16.63.254', '172.16.63.255', '172.16.64.254'],
      answer: 1,
      explanation: '/19: шаг 32 в третьем октете. Подсеть 172.16.32.0–172.16.63.255, последний usable 172.16.63.254.',
    },
    {
      id: 'd15-11',
      type: 'multi',
      question: 'Which two addresses are valid host addresses in the subnet 172.16.4.0/22?',
      options: ['172.16.4.0', '172.16.5.0', '172.16.6.255', '172.16.7.255', '172.16.8.1'],
      answer: [1, 2],
      explanation: '172.16.4.0/22 охватывает 172.16.4.0 – 172.16.7.255. Сеть — 172.16.4.0, broadcast — 172.16.7.255. Адреса вроде 172.16.5.0 и 172.16.6.255 — обычные хосты: «0» и «255» в середине подсети допустимы.',
    },
    {
      id: 'd15-12',
      type: 'fill',
      question: '10.0.0.0/8 is divided into /16 subnets. What is the network address of the 5th subnet? (dotted decimal)',
      answer: ['10.4.0.0', '10.4.0.0/16'],
      explanation: 'Подсети /16: 10.0.0.0 (1-я), 10.1.0.0 (2-я), 10.2.0.0, 10.3.0.0, 10.4.0.0 (5-я).',
    },
    {
      id: 'd15-13',
      type: 'single',
      question: 'Using a /20 mask, what is the "block size" (the increment between subnets), and in which octet?',
      options: ['16, in the third octet', '16, in the fourth octet', '32, in the third octet', '4, in the second octet'],
      answer: 0,
      explanation: '/20: в третьем октете 4 бита сети (11110000 = 240). Шаг = 256 − 240 = 16.',
    },
  ],
  generators: [
    {
      id: 'classb',
      title: 'Подсети классов A и B',
      make(R) {
        return CCNA.ipv4.subnetTask(R, [17, 18, 19, 20, 21, 22, 23, 9, 10, 11, 12, 13, 14], 'd15');
      },
    },
    {
      id: 'count',
      title: 'Сколько подсетей',
      make(R) {
        const p1 = R.pick([8, 16]);
        const p2 = p1 + R.int(2, 8);
        const n = 2 ** (p2 - p1);
        return {
          id: `gen-d15-count-${p1}-${p2}`,
          type: 'fill',
          question: `A /${p1} network is divided into /${p2} subnets. How many subnets are created? (number)`,
          answer: [String(n)],
          explanation: `Заимствовано ${p2 - p1} бит: 2^${p2 - p1} = ${n}.`,
        };
      },
    },
  ],
  labs: [
    {
      id: 'lab-d15-classb',
      kind: 'sim',
      title: 'Subnet a Class B network',
      minutes: 12,
      scenario: 'Сеть **172.20.0.0/16** делится на подсети одинакового размера, каждая минимум на **1000 хостов** (выберите самый длинный подходящий префикс). Настройте R1 и включите интерфейсы. Затем ответьте на вопросы.',
      topology: '        LAN-1         LAN-2         LAN-3\n         │G0/0        │G0/1        │G0/2\n         └──────────── R1 ────────────┘',
      devices: [
        { name: 'R1', kind: 'router', ifaces: ['g0/0-2'], start: 'U' },
        { name: 'SWA', kind: 'switch', ifaces: ['g0/1'], hidden: true },
        { name: 'SWB', kind: 'switch', ifaces: ['g0/1'], hidden: true },
        { name: 'SWC', kind: 'switch', ifaces: ['g0/1'], hidden: true },
      ],
      links: [['R1', 'g0/0', 'SWA', 'g0/1'], ['R1', 'g0/1', 'SWB', 'g0/1'], ['R1', 'g0/2', 'SWC', 'g0/1']],
      tasks: [
        { text: 'G0/0: **первый usable** адрес **1-й** подсети, интерфейс включён.', check: (H) => H.ip('R1', 'g0/0') === '172.20.0.1/22' && H.up('R1', 'g0/0') },
        { text: 'G0/1: **первый usable** адрес **3-й** подсети, интерфейс включён.', check: (H) => H.ip('R1', 'g0/1') === '172.20.8.1/22' && H.up('R1', 'g0/1') },
        { text: 'G0/2: **последний usable** адрес **2-й** подсети, интерфейс включён.', check: (H) => H.ip('R1', 'g0/2') === '172.20.7.254/22' && H.up('R1', 'g0/2') },
      ],
      questions: [
        { text: 'Сколько таких подсетей получается из 172.20.0.0/16?', answer: ['64'] },
        { text: 'Какой сетевой адрес у подсети, в которой находится хост 172.20.13.200?', answer: ['172.20.12.0', '172.20.12.0/22'] },
        { text: 'Сеть 10.0.0.0/8 разделена на подсети /12. Какой сетевой адрес у подсети хоста 10.77.1.1?', answer: ['10.64.0.0', '10.64.0.0/12'] },
      ],
      solution: {
        R1: ['enable', 'configure terminal', 'interface g0/0', 'ip address 172.20.0.1 255.255.252.0', 'no shutdown', 'interface g0/1', 'ip address 172.20.8.1 255.255.252.0', 'no shutdown', 'interface g0/2', 'ip address 172.20.7.254 255.255.252.0', 'no shutdown', 'end'],
      },
      solutionNote: '1000 хостов → 10 хостовых бит (2^10 − 2 = 1022) → /22, маска 255.255.252.0, шаг 4 в третьем октете: 172.20.0.0, .4.0, .8.0 … 2-я подсеть 172.20.4.0–172.20.7.255. Подсетей 2^(22−16) = 64. Для /12 шаг 16 во втором октете: 77 → 64.',
    },
  ],
});
