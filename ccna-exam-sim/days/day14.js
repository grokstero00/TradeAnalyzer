CCNA.registerDay({
  day: 14,
  title: 'Subnetting (Part 1)',
  titleRu: 'Сабнеттинг, часть 1',
  topics: ['CIDR', '/31 and /32', 'Subnetting Class C networks', 'Subnets and hosts formulas'],
  questions: [
    {
      id: 'd14-01',
      type: 'single',
      question: 'What does CIDR stand for, and what problem did it solve?',
      options: [
        'Classless Inter-Domain Routing; it removed the fixed /8, /16 and /24 class boundaries so networks could use any prefix length',
        'Classful Internet Domain Routing; it created Classes A, B and C',
        'Cisco Internal Data Routing; it is a routing protocol',
        'Classless Inter-Domain Routing; it replaced IPv4 with IPv6',
      ],
      answer: 0,
      explanation: 'CIDR (Classless Inter-Domain Routing) отменил жёсткие границы классов. Можно использовать любую длину префикса и не тратить адреса впустую, как при выдаче целого класса.',
    },
    {
      id: 'd14-02',
      type: 'single',
      question: 'Which prefix length is the most efficient for a point-to-point link between two routers, according to RFC 3021?',
      options: ['/30', '/31', '/32', '/29'],
      answer: 1,
      explanation: 'В /31 всего 2 адреса, и на point-to-point линках они оба используются как адреса хостов: сетевого и broadcast-адреса там нет (RFC 3021). /30 даёт 2 usable из 4 адресов.',
    },
    {
      id: 'd14-03',
      type: 'single',
      question: 'What is a /32 prefix used for?',
      options: ['A point-to-point link', 'A route to a single host address', 'The default route', 'A network of 2 hosts'],
      answer: 1,
      explanation: '/32 означает ровно один адрес. Так выглядят local-маршруты (L) роутера и маршруты к конкретному хосту.',
    },
    {
      id: 'd14-04',
      type: 'match',
      question: 'Match each prefix length to its subnet mask.',
      items: ['/25', '/26', '/27', '/28', '/29', '/30'],
      targets: ['255.255.255.128', '255.255.255.192', '255.255.255.224', '255.255.255.240', '255.255.255.248', '255.255.255.252'],
      answer: [0, 1, 2, 3, 4, 5],
      explanation: 'Значения последнего октета: 128, 192, 224, 240, 248, 252 (128 + 64 + 32 + 16 + 8 + 4).',
    },
    {
      id: 'd14-05',
      type: 'single',
      question: 'The network 192.168.1.0/24 is divided into /26 subnets. How many subnets are created, and how many usable hosts does each have?',
      options: ['2 subnets, 126 hosts', '4 subnets, 62 hosts', '8 subnets, 30 hosts', '4 subnets, 64 hosts'],
      answer: 1,
      explanation: 'Заимствовано 2 бита (/24 → /26): 2^2 = 4 подсети. Хостовых бит 6: 2^6 − 2 = 62.',
    },
    {
      id: 'd14-06',
      type: 'single',
      question: 'What is the subnet (network) address of host 192.168.1.100/26?',
      options: ['192.168.1.0', '192.168.1.64', '192.168.1.96', '192.168.1.128'],
      answer: 1,
      explanation: 'Шаг подсетей /26 — 64: .0, .64, .128, .192. 100 попадает в диапазон .64–.127, значит подсеть 192.168.1.64/26.',
    },
    {
      id: 'd14-07',
      type: 'single',
      question: 'What is the broadcast address of the subnet 192.168.1.32/27?',
      options: ['192.168.1.47', '192.168.1.63', '192.168.1.64', '192.168.1.255'],
      answer: 1,
      explanation: 'Шаг /27 — 32. Подсеть .32 заканчивается перед следующей (.64), значит broadcast .63.',
    },
    {
      id: 'd14-08',
      type: 'single',
      question: 'You must divide 192.168.5.0/24 into at least 5 subnets with as many hosts per subnet as possible. Which prefix length should you use?',
      options: ['/26', '/27', '/28', '/29'],
      answer: 1,
      explanation: '/26 даёт только 4 подсети. /27 даёт 8 подсетей (≥ 5) по 30 хостов — это максимум хостов при нужном числе подсетей.',
    },
    {
      id: 'd14-09',
      type: 'single',
      question: 'What is the smallest subnet (longest prefix) that can hold 45 hosts?',
      options: ['/25', '/26', '/27', '/28'],
      answer: 1,
      explanation: '/27 даёт только 30 хостов. /26 даёт 62 ≥ 45.',
    },
    {
      id: 'd14-10',
      type: 'multi',
      question: 'Which two addresses are valid host addresses in the subnet 192.168.10.64/27?',
      options: ['192.168.10.64', '192.168.10.65', '192.168.10.94', '192.168.10.95', '192.168.10.96'],
      answer: [1, 2],
      explanation: '192.168.10.64/27: сеть .64, broadcast .95, хосты .65–.94. Адрес .96 уже в следующей подсети.',
    },
    {
      id: 'd14-11',
      type: 'fill',
      question: 'A /24 network is subnetted by borrowing 3 host bits. How many subnets are created? (number)',
      answer: ['8'],
      explanation: 'Число подсетей = 2^x, где x — число заимствованных бит: 2^3 = 8 (подсети /27).',
    },
    {
      id: 'd14-12',
      type: 'single',
      question: 'How many usable host addresses are in a /30 subnet?',
      options: ['1', '2', '4', '6'],
      answer: 1,
      explanation: '2 хостовых бита: 2^2 − 2 = 2. Поэтому /30 традиционно использовали для линков роутер–роутер.',
    },
    {
      id: 'd14-13',
      type: 'single',
      question: 'What is the last usable host address of the subnet 192.168.20.128/25?',
      options: ['192.168.20.254', '192.168.20.255', '192.168.20.191', '192.168.20.127'],
      answer: 0,
      explanation: '/25: шаг 128. Подсеть .128–.255: broadcast .255, последний usable .254.',
    },
  ],
  generators: [
    {
      id: 'classc',
      title: 'Подсети класса C (/25–/30)',
      make(R) {
        return CCNA.ipv4.subnetTask(R, [25, 26, 27, 28, 29, 30], 'd14');
      },
    },
    {
      id: 'mask',
      title: 'Префикс ↔ маска',
      make(R) {
        const p = R.int(25, 30);
        const mask = CCNA.ipv4.maskStr(p);
        if (R.int(0, 1)) {
          return { id: `gen-d14-p2m-${p}`, type: 'fill', question: `Write the prefix length /${p} as a dotted-decimal subnet mask.`, answer: [mask], explanation: `/${p}: в последнем октете ${p - 24} единиц → ${mask.split('.')[3]}. Маска ${mask}.` };
        }
        return { id: `gen-d14-m2p-${p}`, type: 'fill', question: `Write the subnet mask ${mask} as a prefix length (for example /24).`, answer: [`/${p}`, String(p)], explanation: `24 бита в первых трёх октетах + ${p - 24} в последнем = /${p}.` };
      },
    },
  ],
  labs: [
    {
      id: 'lab-d14-classc',
      kind: 'sim',
      title: 'Subnet a Class C network',
      minutes: 12,
      scenario: 'Сеть **192.168.10.0/24** нужно разделить на **4 равные подсети**. Назначьте адреса интерфейсам R1 и включите их. Линк к R2 использует **192.168.99.0/31** (RFC 3021): R1 берёт первый адрес, R2 уже настроен.',
      topology: '        SW-A          SW-B          SW-C\n         │G0/0        │G0/1        │G0/2\n         └──────────── R1 ────────────┘\n                       │G0/3   192.168.99.0/31\n                       R2 (192.168.99.1)',
      devices: [
        { name: 'R1', kind: 'router', ifaces: ['g0/0-3'], start: 'U' },
        { name: 'R2', kind: 'router', ifaces: ['g0/0'], hidden: true, setup: ['interface g0/0', 'ip address 192.168.99.1 255.255.255.254', 'no shutdown'] },
        { name: 'SWA', kind: 'switch', ifaces: ['g0/1'], hidden: true },
        { name: 'SWB', kind: 'switch', ifaces: ['g0/1'], hidden: true },
        { name: 'SWC', kind: 'switch', ifaces: ['g0/1'], hidden: true },
      ],
      links: [['R1', 'g0/0', 'SWA', 'g0/1'], ['R1', 'g0/1', 'SWB', 'g0/1'], ['R1', 'g0/2', 'SWC', 'g0/1'], ['R1', 'g0/3', 'R2', 'g0/0']],
      tasks: [
        { text: 'G0/0: **первый usable** адрес **1-й** подсети, интерфейс включён.', check: (H) => H.ip('R1', 'g0/0') === '192.168.10.1/26' && H.up('R1', 'g0/0') },
        { text: 'G0/1: **первый usable** адрес **2-й** подсети, интерфейс включён.', check: (H) => H.ip('R1', 'g0/1') === '192.168.10.65/26' && H.up('R1', 'g0/1') },
        { text: 'G0/2: **последний usable** адрес **4-й** подсети, интерфейс включён.', check: (H) => H.ip('R1', 'g0/2') === '192.168.10.254/26' && H.up('R1', 'g0/2') },
        { text: 'G0/3: адрес **192.168.99.0/31**, R1 успешно пингует R2 (192.168.99.1).', check: (H) => H.ip('R1', 'g0/3') === '192.168.99.0/31' && H.ping('R1', '192.168.99.1') },
      ],
      questions: [
        { text: 'Какой broadcast-адрес у **3-й** подсети?', answer: ['192.168.10.191'] },
        { text: 'Сколько usable хостов в каждой из этих подсетей?', answer: ['62'] },
      ],
      solution: {
        R1: ['enable', 'configure terminal', 'interface g0/0', 'ip address 192.168.10.1 255.255.255.192', 'no shutdown', 'interface g0/1', 'ip address 192.168.10.65 255.255.255.192', 'no shutdown', 'interface g0/2', 'ip address 192.168.10.254 255.255.255.192', 'no shutdown', 'interface g0/3', 'ip address 192.168.99.0 255.255.255.254', 'no shutdown', 'end', 'ping 192.168.99.1'],
      },
      solutionNote: '4 подсети = 2 заимствованных бита → /26 (255.255.255.192), шаг 64: .0, .64, .128, .192. Третья подсеть .128–.191.',
      explanation: 'В /31 оба адреса — адреса хостов, поэтому 192.168.99.0 можно назначить интерфейсу.',
    },
  ],
});
