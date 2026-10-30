CCNA.registerDay({
  day: 8,
  title: 'IPv4 Addressing (Part 2)',
  titleRu: 'IPv4-адресация, часть 2',
  topics: ['Usable hosts (2^n − 2)', 'First / last usable', 'ip address', 'show ip interface brief', 'shutdown / no shutdown', 'description'],
  questions: [
    {
      id: 'd08-01',
      type: 'single',
      question: 'Which formula calculates the number of usable host addresses in a network, where n is the number of host bits?',
      options: ['2^n', '2^n − 1', '2^n − 2', '2^(32 − n)'],
      answer: 2,
      explanation: 'Всего адресов 2^n, но два нельзя назначить хостам: сетевой адрес (все биты хоста = 0) и broadcast (все биты хоста = 1). Поэтому usable = 2^n − 2.',
    },
    {
      id: 'd08-02',
      type: 'match',
      question: 'Match each class to the maximum number of usable host addresses per network (default prefix).',
      items: ['Class A (/8)', 'Class B (/16)', 'Class C (/24)'],
      targets: ['16,777,214', '65,534', '254', '1,022'],
      answer: [0, 1, 2],
      explanation: 'A: 2^24 − 2 = 16 777 214; B: 2^16 − 2 = 65 534; C: 2^8 − 2 = 254.',
    },
    {
      id: 'd08-03',
      type: 'match',
      question: 'Match each class to the total number of possible networks in that class.',
      items: ['Class A', 'Class B', 'Class C'],
      targets: ['128 (2^7)', '16,384 (2^14)', '2,097,152 (2^21)', '256 (2^8)'],
      answer: [0, 1, 2],
      explanation: 'Число сетей = 2^(сетевые биты − фиксированные биты класса). A: 8 − 1 = 7 → 128. B: 16 − 2 = 14 → 16 384. C: 24 − 3 = 21 → 2 097 152.',
    },
    {
      id: 'd08-04',
      type: 'single',
      question: 'What is the first usable host address of the network 172.16.0.0/16?',
      options: ['172.16.0.0', '172.16.0.1', '172.16.1.1', '172.16.255.254'],
      answer: 1,
      explanation: 'Первый usable = сетевой адрес + 1 = 172.16.0.1. Последний usable = broadcast − 1 = 172.16.255.254.',
    },
    {
      id: 'd08-05',
      type: 'single',
      question: 'What is the last usable host address of the network 10.0.0.0/8?',
      options: ['10.0.0.254', '10.255.255.254', '10.255.255.255', '10.254.254.254'],
      answer: 1,
      explanation: 'Broadcast сети 10.0.0.0/8 — 10.255.255.255, значит последний usable — 10.255.255.254.',
    },
    {
      id: 'd08-06',
      type: 'multi',
      question: 'Which two addresses can be assigned to hosts in the network 192.168.5.0/24?',
      options: ['192.168.5.0', '192.168.5.1', '192.168.5.254', '192.168.5.255', '192.168.6.1'],
      answer: [1, 2],
      explanation: '192.168.5.0 — сетевой адрес, 192.168.5.255 — broadcast, их назначать нельзя. 192.168.6.1 находится в другой сети. Usable: 192.168.5.1 – 192.168.5.254.',
    },
    {
      id: 'd08-07',
      type: 'fill',
      question: 'Type the interface configuration command that assigns the IP address 10.255.255.254 with the default Class A netmask (dotted-decimal mask).',
      answer: ['ip address 10.255.255.254 255.0.0.0', 'ip add 10.255.255.254 255.0.0.0', 'ip addr 10.255.255.254 255.0.0.0'],
      explanation: 'Синтаксис Cisco IOS: `ip address <IP> <маска в dotted decimal>`. Префикс вида /8 в этой команде не принимается.',
    },
    {
      id: 'd08-08',
      type: 'single',
      exhibit: 'R1# show ip interface brief\nInterface              IP-Address      OK? Method Status                Protocol\nGigabitEthernet0/0     10.255.255.254  YES manual administratively down down\nGigabitEthernet0/1     unassigned      YES unset  administratively down down\nGigabitEthernet0/2     unassigned      YES unset  administratively down down',
      question: 'Refer to the exhibit. An IP address was configured on G0/0, but the interface is not working. What must be done?',
      options: [
        'Configure the interface with the "no shutdown" command',
        'Replace the cable',
        'Configure a different IP address',
        'Save the configuration with "write memory"',
      ],
      answer: 0,
      explanation: 'Status `administratively down` означает, что интерфейс выключен командой `shutdown`. На роутерах Cisco интерфейсы по умолчанию выключены — нужно выполнить `no shutdown` в режиме интерфейса.',
    },
    {
      id: 'd08-09',
      type: 'single',
      question: 'In the output of "show ip interface brief", which column shows the Layer 1 status of the interface, and which shows the Layer 2 status?',
      options: [
        'Status = Layer 1; Protocol = Layer 2',
        'Status = Layer 2; Protocol = Layer 1',
        'Method = Layer 1; OK? = Layer 2',
        'Both columns show only Layer 3 status',
      ],
      answer: 0,
      explanation: 'Status — физический уровень (L1), `administratively down` = shutdown. Protocol — канальный уровень (L2). Рабочий интерфейс: `up / up`.',
    },
    {
      id: 'd08-10',
      type: 'single',
      question: 'Which statement about router interfaces on Cisco devices is true by default?',
      options: [
        'They are enabled and have IP addresses assigned.',
        'They are disabled with the shutdown command applied.',
        'They obtain IP addresses automatically from the switch.',
        'They operate in Layer 2 mode only.',
      ],
      answer: 1,
      explanation: 'Интерфейсы роутеров Cisco по умолчанию имеют команду `shutdown` (administratively down). Интерфейсы коммутаторов, наоборот, по умолчанию включены.',
    },
    {
      id: 'd08-11',
      type: 'single',
      question: 'Which interface configuration command adds a human-readable label, such as "## to SW1 ##", to an interface?',
      options: ['name', 'description', 'label', 'remark'],
      answer: 1,
      explanation: '`R1(config-if)# description ## to SW1 ##`. Описание видно в `show running-config`, `show interfaces` и `show interfaces description`.',
    },
    {
      id: 'd08-12',
      type: 'single',
      question: 'Which command displays a summary of each interface with its Status, Protocol and configured description?',
      options: ['show ip interface brief', 'show interfaces description', 'show running-config', 'show interfaces status'],
      answer: 1,
      explanation: '`show interfaces description` показывает Interface, Status, Protocol и Description. `show ip interface brief` описаний не показывает.',
    },
    {
      id: 'd08-13',
      type: 'single',
      question: 'Which address is used to send a packet to all hosts in the network 192.168.1.0/24?',
      options: ['192.168.1.0', '192.168.1.1', '192.168.1.255', '255.255.255.0'],
      answer: 2,
      explanation: 'Broadcast-адрес сети — последний адрес (все биты хоста = 1): 192.168.1.255.',
    },
  ],
  generators: [
    {
      id: 'network',
      title: 'Network address',
      make(R) {
        const ip4 = CCNA.ipv4;
        const prefix = R.pick([8, 16, 24]);
        const ip = ip4.random(R, prefix);
        const net = ip4.toStr(ip4.network(ip, prefix));
        return {
          id: `gen-d08-network-${ip}`,
          type: 'fill',
          question: `What is the network address of the host ${ip}/${prefix}?`,
          answer: [net],
          explanation: `/${prefix}: первые ${prefix / 8} октет(а) — сетевая часть, остальное — хостовая. Обнуляем хостовую часть: ${net}.`,
        };
      },
    },
    {
      id: 'broadcast',
      title: 'Broadcast address',
      make(R) {
        const ip4 = CCNA.ipv4;
        const prefix = R.pick([8, 16, 24]);
        const ip = ip4.random(R, prefix);
        const bc = ip4.toStr(ip4.broadcast(ip, prefix));
        const net = ip4.toStr(ip4.network(ip, prefix));
        const opts = R.choice(bc, [net, ip4.toStr(ip4.broadcast(ip, prefix) - 1), ip4.toStr(ip4.network(ip, prefix) + 1), '255.255.255.255']);
        return {
          id: `gen-d08-broadcast-${ip}`,
          type: 'single',
          question: `What is the broadcast address of the network that host ${ip}/${prefix} belongs to?`,
          options: opts.options,
          answer: opts.answer,
          explanation: `Сеть ${net}/${prefix}. Broadcast — все биты хостовой части равны 1: ${bc}.`,
        };
      },
    },
    {
      id: 'range',
      title: 'First / last usable',
      make(R) {
        const ip4 = CCNA.ipv4;
        const prefix = R.pick([8, 16, 24]);
        const ip = ip4.random(R, prefix);
        const netN = ip4.network(ip, prefix);
        const bcN = ip4.broadcast(ip, prefix);
        const net = ip4.toStr(netN);
        const first = R.int(0, 1) === 0;
        const value = ip4.toStr(first ? netN + 1 : bcN - 1);
        return {
          id: `gen-d08-range-${ip}-${first ? 'f' : 'l'}`,
          type: 'fill',
          question: `What is the ${first ? 'first' : 'last'} usable host address of the network ${net}/${prefix}?`,
          answer: [value],
          explanation: `Сетевой адрес ${net}, broadcast ${ip4.toStr(bcN)}. Первый usable = сеть + 1 (${ip4.toStr(netN + 1)}), последний usable = broadcast − 1 (${ip4.toStr(bcN - 1)}).`,
        };
      },
    },
    {
      id: 'hosts',
      title: 'Usable hosts',
      make(R) {
        const bits = R.int(2, 16);
        const total = 2 ** bits;
        const usable = total - 2;
        const opts = R.choice(usable.toLocaleString('en-US'), [total, total - 1, 2 ** (bits - 1) - 2, 2 ** (bits + 1) - 2].map((v) => v.toLocaleString('en-US')));
        return {
          id: `gen-d08-hosts-${bits}`,
          type: 'single',
          question: `A network has ${bits} host bits. How many usable host addresses does it have?`,
          options: opts.options,
          answer: opts.answer,
          explanation: `2^${bits} − 2 = ${total.toLocaleString('ru-RU')} − 2 = ${usable.toLocaleString('ru-RU')}. Вычитаем сетевой и broadcast-адреса.`,
        };
      },
    },
  ],
  labs: [
    {
      id: 'lab-d08-ipconfig',
      kind: 'sim',
      title: 'Configure IP addresses on R1',
      minutes: 10,
      scenario: 'Настройте интерфейсы R1, подключённые к трём LAN, и включите их. Последний usable адрес каждой сети отдан роутеру.',
      topology: '   SW1                 SW2                  SW3\n    │G0/0              │G0/1               │G0/2\n    └───────────────── R1 ──────────────────┘\n192.168.1.0/24    172.16.0.0/16      10.0.0.0/8',
      devices: [
        { name: 'R1', kind: 'router', hostname: 'R1', ifaces: ['g0/0-2'], start: 'U' },
        { name: 'SW1', kind: 'switch', ifaces: ['g0/1'], hidden: true },
        { name: 'SW2', kind: 'switch', ifaces: ['g0/1'], hidden: true },
        { name: 'SW3', kind: 'switch', ifaces: ['g0/1'], hidden: true },
      ],
      links: [['R1', 'g0/0', 'SW1', 'g0/1'], ['R1', 'g0/1', 'SW2', 'g0/1'], ['R1', 'g0/2', 'SW3', 'g0/1']],
      tasks: [
        { text: 'G0/0: последний usable адрес сети 192.168.1.0/24, интерфейс включён.', check: (H) => H.ip('R1', 'g0/0') === '192.168.1.254/24' && H.up('R1', 'g0/0') },
        { text: 'G0/1: последний usable адрес сети 172.16.0.0/16, интерфейс включён.', check: (H) => H.ip('R1', 'g0/1') === '172.16.255.254/16' && H.up('R1', 'g0/1') },
        { text: 'G0/2: последний usable адрес сети 10.0.0.0/8, интерфейс включён.', check: (H) => H.ip('R1', 'g0/2') === '10.255.255.254/8' && H.up('R1', 'g0/2') },
        { text: 'Добавьте на G0/0 описание `## to SW1 ##`.', check: (H) => /SW1/i.test(H.ifc('R1', 'g0/0').desc) },
        { text: 'Сохраните конфигурацию.', check: (H) => H.saved('R1') },
      ],
      questions: [
        { text: 'Сколько usable адресов хостов в сети на G0/1?', answer: ['65534', '65,534'] },
      ],
      solution: { R1: ['enable', 'configure terminal', 'interface g0/0', 'ip address 192.168.1.254 255.255.255.0', 'description ## to SW1 ##', 'no shutdown', 'interface g0/1', 'ip address 172.16.255.254 255.255.0.0', 'no shutdown', 'interface g0/2', 'ip address 10.255.255.254 255.0.0.0', 'no shutdown', 'end', 'write memory', 'show ip interface brief'] },
      explanation: 'Интерфейсы роутера по умолчанию выключены (administratively down), поэтому без `no shutdown` они не заработают.',
    },
  ],
});
