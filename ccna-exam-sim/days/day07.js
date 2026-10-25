CCNA.registerDay({
  day: 7,
  title: 'IPv4 Addressing (Part 1)',
  titleRu: 'IPv4-адресация, часть 1',
  topics: ['Binary/decimal', 'Dotted decimal', 'Prefix length / netmask', 'IPv4 classes', 'Network / broadcast address'],
  questions: [
    {
      id: 'd07-01',
      type: 'single',
      question: 'How many bits are in an IPv4 address?',
      options: ['8', '32', '48', '128'],
      answer: 1,
      explanation: 'IPv4-адрес — 32 бита, записывается как 4 октета по 8 бит в десятичном виде через точку (dotted decimal). 48 бит — MAC, 128 бит — IPv6.',
    },
    {
      id: 'd07-02',
      type: 'match',
      question: 'Match each IPv4 address class to its range of first-octet values.',
      items: ['Class A', 'Class B', 'Class C', 'Class D', 'Class E'],
      targets: ['0 – 127', '128 – 191', '192 – 223', '224 – 239', '240 – 255'],
      answer: [0, 1, 2, 3, 4],
      explanation: 'A: 0–127 (первый бит 0); B: 128–191 (10); C: 192–223 (110); D: 224–239 (1110), multicast; E: 240–255 (1111), reserved/experimental.',
    },
    {
      id: 'd07-03',
      type: 'match',
      question: 'Match each class to its default prefix length.',
      items: ['Class A', 'Class B', 'Class C'],
      targets: ['/8 (255.0.0.0)', '/16 (255.255.0.0)', '/24 (255.255.255.0)', '/32 (255.255.255.255)'],
      answer: [0, 1, 2],
      explanation: 'Класс A — /8, класс B — /16, класс C — /24. Префикс показывает, сколько бит слева относятся к сетевой части адреса.',
    },
    {
      id: 'd07-04',
      type: 'single',
      question: 'What are the first (leading) bits of every Class C address?',
      options: ['0', '10', '110', '1110'],
      answer: 2,
      explanation: 'A начинается с 0, B — с 10, C — с 110, D — с 1110, E — с 1111. 110xxxxx = 192–223.',
    },
    {
      id: 'd07-05',
      type: 'single',
      question: 'What is the decimal value of the binary octet 11000000?',
      options: ['128', '160', '192', '224'],
      answer: 2,
      explanation: 'Веса битов: 128 64 32 16 8 4 2 1. 11000000 = 128 + 64 = 192.',
    },
    {
      id: 'd07-06',
      type: 'single',
      question: 'What is the purpose of the address range 127.0.0.0 – 127.255.255.255?',
      options: [
        'Multicast',
        'Loopback addresses used to test the network stack on the local device',
        'Private addresses for home networks',
        'Reserved for experimental use (Class E)',
      ],
      answer: 1,
      explanation: '127.0.0.0/8 — loopback: трафик на эти адреса не покидает устройство и используется для проверки сетевого стека (например, `ping 127.0.0.1`). Поэтому реально используемый диапазон класса A для сетей — 1–126.',
    },
    {
      id: 'd07-07',
      type: 'single',
      question: 'Which class of IPv4 addresses is reserved for multicast?',
      options: ['Class B', 'Class C', 'Class D', 'Class E'],
      answer: 2,
      explanation: 'Класс D (224–239) — multicast. Класс E (240–255) — зарезервирован (экспериментальный).',
    },
    {
      id: 'd07-08',
      type: 'single',
      question: 'Host 192.168.10.37/24. What is the network address of the network this host belongs to?',
      options: ['192.168.0.0', '192.168.10.0', '192.168.10.255', '192.168.10.1'],
      answer: 1,
      explanation: '/24 — первые три октета сетевая часть. Сетевой адрес: хостовая часть заполнена нулями → 192.168.10.0. Его нельзя назначить хосту.',
    },
    {
      id: 'd07-09',
      type: 'single',
      question: 'What is the broadcast address of the network 172.16.0.0/16?',
      options: ['172.16.0.255', '172.16.255.255', '172.255.255.255', '255.255.255.255'],
      answer: 1,
      explanation: 'Broadcast — хостовая часть из одних единиц. Для /16 хостовая часть — последние два октета: 172.16.255.255. Пакет на этот адрес получают все хосты сети.',
    },
    {
      id: 'd07-10',
      type: 'single',
      question: 'What is the prefix length that corresponds to the netmask 255.255.255.0?',
      options: ['/8', '/16', '/24', '/32'],
      answer: 2,
      explanation: '255.255.255.0 = 11111111.11111111.11111111.00000000 — 24 единицы → /24.',
    },
    {
      id: 'd07-11',
      type: 'single',
      question: 'Which statement about router interfaces is correct?',
      options: [
        'All interfaces of a router must be in the same network.',
        'Each router interface connects to a different network and needs an IP address in that network.',
        'Router interfaces do not need IP addresses.',
        'Router interfaces use only MAC addresses to forward packets between networks.',
      ],
      answer: 1,
      explanation: 'Каждый интерфейс роутера подключён к отдельной сети (отдельному broadcast-домену) и получает IP-адрес из этой сети. Роутер пересылает пакеты между этими сетями на основе IP.',
    },
    {
      id: 'd07-12',
      type: 'fill',
      question: 'Convert the decimal value 172 to an 8-bit binary number.',
      answer: ['10101100'],
      explanation: '172 = 128 + 32 + 8 + 4 → 1 0 1 0 1 1 0 0 = 10101100.',
    },
    {
      id: 'd07-13',
      type: 'single',
      question: 'What is the largest decimal value one octet of an IPv4 address can have?',
      options: ['127', '128', '255', '256'],
      answer: 2,
      explanation: '8 бит: 11111111 = 128+64+32+16+8+4+2+1 = 255. Всего 256 значений (0–255).',
    },
  ],
  generators: [
    {
      id: 'dec2bin',
      title: 'Decimal → binary',
      make(R) {
        const n = R.int(1, 254);
        const bin = n.toString(2).padStart(8, '0');
        return {
          id: `gen-d07-dec2bin-${n}`,
          type: 'fill',
          question: `Convert the decimal value ${n} to an 8-bit binary number.`,
          answer: [bin, n.toString(2)],
          explanation: `Веса битов 128 64 32 16 8 4 2 1. ${n} = ${CCNA.ipv4.weights(n)} → ${bin}.`,
        };
      },
    },
    {
      id: 'bin2dec',
      title: 'Binary → decimal',
      make(R) {
        const n = R.int(1, 254);
        const bin = n.toString(2).padStart(8, '0');
        return {
          id: `gen-d07-bin2dec-${n}`,
          type: 'fill',
          question: `Convert the binary octet ${bin} to decimal.`,
          answer: [String(n)],
          explanation: `Складываем веса единичных битов: ${CCNA.ipv4.weights(n)} = ${n}.`,
        };
      },
    },
    {
      id: 'class',
      title: 'Address class',
      make(R) {
        const first = R.pick([R.int(1, 126), R.int(128, 191), R.int(192, 223), R.int(224, 239), R.int(240, 254)]);
        const ip = `${first}.${R.int(0, 255)}.${R.int(0, 255)}.${R.int(1, 254)}`;
        const cls = first < 128 ? 'A' : first < 192 ? 'B' : first < 224 ? 'C' : first < 240 ? 'D' : 'E';
        const options = ['Class A', 'Class B', 'Class C', 'Class D', 'Class E'];
        return {
          id: `gen-d07-class-${ip}`,
          type: 'single',
          fixedOrder: true,
          question: `To which class does the IPv4 address ${ip} belong?`,
          options,
          answer: 'ABCDE'.indexOf(cls),
          explanation: `Первый октет ${first} (${first.toString(2).padStart(8, '0')}) попадает в диапазон класса ${cls}. A: 0–127, B: 128–191, C: 192–223, D: 224–239, E: 240–255.`,
        };
      },
    },
  ],
});

