CCNA.registerDay({
  day: 16,
  title: 'Subnetting (Part 3 – VLSM)',
  titleRu: 'Сабнеттинг, часть 3 (VLSM)',
  topics: ['VLSM', 'Largest subnet first', 'Overlapping subnets'],
  questions: [
    {
      id: 'd16-01',
      type: 'single',
      question: 'What is VLSM?',
      options: [
        'Dividing a network into subnets of different sizes',
        'Using only one subnet mask for every subnet of a network',
        'A protocol that assigns IP addresses automatically',
        'A method of converting IPv4 to IPv6',
      ],
      answer: 0,
      explanation: 'VLSM (Variable-Length Subnet Masking) — подсети разного размера из одного блока адресов. Каждый сегмент получает ровно столько адресов, сколько нужно, и меньше адресов пропадает.',
    },
    {
      id: 'd16-02',
      type: 'order',
      question: 'Put the VLSM process steps in order.',
      items: [
        'List the subnets and the number of hosts each needs',
        'Sort the subnets from largest to smallest',
        'Assign the largest subnet first, starting from the beginning of the address block',
        'Assign the next largest subnet immediately after the previous one',
        'Repeat until every subnet (including point-to-point links) has an address range',
      ],
      explanation: 'Главное правило VLSM: сначала крупные подсети, потом мелкие. Так подсети выравниваются по своим границам и не перекрываются.',
    },
    {
      id: 'd16-03',
      type: 'single',
      exhibit: 'Address block: 192.168.1.0/24\n\nLAN A: 100 hosts\nLAN B:  50 hosts\nLAN C:  20 hosts\nTwo point-to-point links (2 hosts each)',
      question: 'Refer to the exhibit. Using VLSM and assigning the largest subnet first, which subnet does LAN A receive?',
      options: ['192.168.1.0/24', '192.168.1.0/25', '192.168.1.0/26', '192.168.1.128/25'],
      answer: 1,
      explanation: '100 хостов → /25 (126 хостов). Первая подсеть с начала блока: 192.168.1.0/25 (.0–.127).',
    },
    {
      id: 'd16-04',
      type: 'single',
      exhibit: 'Address block: 192.168.1.0/24\n\nLAN A: 100 hosts → 192.168.1.0/25\nLAN B:  50 hosts\nLAN C:  20 hosts\nTwo point-to-point links (2 hosts each)',
      question: 'Refer to the exhibit. Which subnet does LAN B receive?',
      options: ['192.168.1.64/26', '192.168.1.128/26', '192.168.1.128/25', '192.168.1.192/26'],
      answer: 1,
      explanation: '50 хостов → /26 (62 хоста). Следующий свободный адрес после .127 — .128 → 192.168.1.128/26 (.128–.191).',
    },
    {
      id: 'd16-05',
      type: 'single',
      exhibit: 'Address block: 192.168.1.0/24\n\nLAN A: 100 hosts → 192.168.1.0/25\nLAN B:  50 hosts → 192.168.1.128/26\nLAN C:  20 hosts\nTwo point-to-point links (2 hosts each)',
      question: 'Refer to the exhibit. Which subnets do LAN C and the first point-to-point link (/30) receive?',
      options: [
        'LAN C 192.168.1.192/27, link 192.168.1.224/30',
        'LAN C 192.168.1.192/28, link 192.168.1.208/30',
        'LAN C 192.168.1.160/27, link 192.168.1.192/30',
        'LAN C 192.168.1.192/26, link 192.168.1.252/30',
      ],
      answer: 0,
      explanation: '20 хостов → /27 (30 хостов): 192.168.1.192/27 (.192–.223). Затем линки /30: 192.168.1.224/30 и 192.168.1.228/30.',
    },
    {
      id: 'd16-06',
      type: 'single',
      question: 'What is the smallest subnet that can hold exactly 14 hosts?',
      options: ['/27', '/28', '/29', '/30'],
      answer: 1,
      explanation: '/28: 2^4 − 2 = 14 хостов, ровно столько, сколько нужно.',
    },
    {
      id: 'd16-07',
      type: 'multi',
      question: 'Which two subnets overlap with 10.1.0.0/22?',
      options: ['10.1.2.0/24', '10.1.3.128/25', '10.1.4.0/24', '10.0.0.0/23', '10.1.8.0/22'],
      answer: [0, 1],
      explanation: '10.1.0.0/22 = 10.1.0.0 – 10.1.3.255. В этот диапазон попадают 10.1.2.0/24 и 10.1.3.128/25. 10.1.4.0/24, 10.0.0.0/23 (10.0.0.0–10.0.1.255) и 10.1.8.0/22 лежат вне него.',
    },
    {
      id: 'd16-08',
      type: 'single',
      question: 'What is the main benefit of VLSM compared to using one mask for all subnets (FLSM)?',
      options: ['Fewer wasted IP addresses', 'Faster routing table lookups', 'No need for a default gateway', 'It removes the need for subnet masks'],
      answer: 0,
      explanation: 'С одной маской линку на 2 хоста пришлось бы выдать такую же подсеть, как LAN на 100 хостов. VLSM подбирает размер под каждую потребность.',
    },
    {
      id: 'd16-09',
      type: 'single',
      question: 'A LAN needs 30 hosts. Which prefix length should it get?',
      options: ['/26', '/27', '/28', '/29'],
      answer: 1,
      explanation: '/27 даёт ровно 30 usable хостов. /28 — только 14.',
    },
    {
      id: 'd16-10',
      type: 'single',
      question: 'Why should subnets be assigned from largest to smallest when using VLSM?',
      options: [
        'It keeps every subnet aligned on its own boundary and avoids overlapping or wasted gaps',
        'Routers require larger subnets to have lower addresses',
        'Smaller subnets cannot start at .0',
        'It is required by the OSPF protocol',
      ],
      answer: 0,
      explanation: 'Сетевой адрес подсети должен быть кратен её размеру. Если идти от больших к меньшим, следующая подсеть всегда начинается на правильной границе.',
    },
    {
      id: 'd16-11',
      type: 'fill',
      question: 'After assigning 192.168.1.0/25, 192.168.1.128/26 and 192.168.1.192/27, what is the network address of the next free /30 subnet?',
      answer: ['192.168.1.224', '192.168.1.224/30'],
      explanation: '192.168.1.192/27 заканчивается на .223, следующий свободный адрес — .224.',
    },
  ],
  generators: [
    {
      id: 'vlsm',
      title: 'VLSM-распределение',
      make(R) {
        const ip4 = CCNA.ipv4;
        const third = R.int(0, 254);
        const base = ip4.toInt(`192.168.${third}.0`);
        const lans = [
          { name: 'A', hosts: R.int(65, 120) },
          { name: 'B', hosts: R.int(31, 60) },
          { name: 'C', hosts: R.int(15, 29) },
          { name: 'D', hosts: R.int(3, 13) },
        ].sort((a, b) => b.hosts - a.hosts);
        let cur = base;
        for (const l of lans) {
          l.p = ip4.prefixFor(l.hosts);
          l.net = cur;
          cur += 2 ** (32 - l.p);
        }
        const ask = R.pick(lans.slice(1));
        const list = lans.map((l) => `LAN ${l.name}: ${l.hosts} hosts`).join(', ');
        const steps = lans.map((l) => `${l.name} (${l.hosts}) → /${l.p} = ${ip4.toStr(l.net)}/${l.p}`).join('; ');
        return {
          id: `gen-d16-vlsm-${third}-${lans.map((l) => l.hosts).join('-')}-${ask.name}`,
          type: 'fill',
          question: `Using VLSM on 192.168.${third}.0/24 (largest subnet first, starting at .0): ${list}. What subnet does LAN ${ask.name} get? (format: 192.168.x.y/z)`,
          answer: [`${ip4.toStr(ask.net)}/${ask.p}`],
          explanation: `От большего к меньшему: ${steps}.`,
        };
      },
    },
  ],
  labs: [
    {
      id: 'lab-d16-vlsm',
      kind: 'sim',
      title: 'VLSM addressing plan',
      minutes: 15,
      scenario: 'Блок **192.168.5.0/24** распределите с помощью VLSM (сначала самая большая подсеть, начиная с 192.168.5.0). R1 получает **первый usable** адрес каждой подсети. Линк к R2 — /30, R2 уже настроен на втором адресе этой подсети.',
      topology: 'LAN A (110 hosts)    LAN B (45 hosts)    LAN C (20 hosts)\n      │G0/0               │G0/1               │G0/2\n      └───────────────── R1 ───────────────────┘\n                          │G0/3  (point-to-point, 2 hosts)\n                          R2',
      devices: [
        { name: 'R1', kind: 'router', ifaces: ['g0/0-3'], start: 'U' },
        { name: 'R2', kind: 'router', ifaces: ['g0/0'], hidden: true, setup: ['interface g0/0', 'ip address 192.168.5.226 255.255.255.252', 'no shutdown'] },
        { name: 'SWA', kind: 'switch', ifaces: ['g0/1'], hidden: true },
        { name: 'SWB', kind: 'switch', ifaces: ['g0/1'], hidden: true },
        { name: 'SWC', kind: 'switch', ifaces: ['g0/1'], hidden: true },
      ],
      links: [['R1', 'g0/0', 'SWA', 'g0/1'], ['R1', 'g0/1', 'SWB', 'g0/1'], ['R1', 'g0/2', 'SWC', 'g0/1'], ['R1', 'g0/3', 'R2', 'g0/0']],
      tasks: [
        { text: 'G0/0 (LAN A, 110 хостов) настроен и включён.', check: (H) => H.ip('R1', 'g0/0') === '192.168.5.1/25' && H.up('R1', 'g0/0') },
        { text: 'G0/1 (LAN B, 45 хостов) настроен и включён.', check: (H) => H.ip('R1', 'g0/1') === '192.168.5.129/26' && H.up('R1', 'g0/1') },
        { text: 'G0/2 (LAN C, 20 хостов) настроен и включён.', check: (H) => H.ip('R1', 'g0/2') === '192.168.5.193/27' && H.up('R1', 'g0/2') },
        { text: 'G0/3 (линк к R2) настроен, R1 пингует R2.', check: (H) => H.ip('R1', 'g0/3') === '192.168.5.225/30' && H.ping('R1', '192.168.5.226') },
      ],
      questions: [
        { text: 'Какой broadcast-адрес у LAN B?', answer: ['192.168.5.191'] },
        { text: 'Сколько адресов блока остаётся свободными после линка /30 (до 192.168.5.255 включительно)?', answer: ['28'] },
      ],
      solution: {
        R1: ['enable', 'configure terminal', 'interface g0/0', 'ip address 192.168.5.1 255.255.255.128', 'no shutdown', 'interface g0/1', 'ip address 192.168.5.129 255.255.255.192', 'no shutdown', 'interface g0/2', 'ip address 192.168.5.193 255.255.255.224', 'no shutdown', 'interface g0/3', 'ip address 192.168.5.225 255.255.255.252', 'no shutdown', 'end', 'ping 192.168.5.226'],
      },
      solutionNote: 'LAN A 110 → /25: 192.168.5.0/25. LAN B 45 → /26: 192.168.5.128/26. LAN C 20 → /27: 192.168.5.192/27. Линк → /30: 192.168.5.224/30 (R1 .225, R2 .226). Свободно .228–.255 = 28 адресов.',
    },
  ],
});
