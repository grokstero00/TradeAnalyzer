/*
 * Template for a new course day.
 * 1. Copy this file to dayNN.js (for example day23.js).
 * 2. Fill in day, title and questions.
 * 3. Add 'day23.js' to the list in days/manifest.js.
 * IDs must be unique across the whole bank: use the dNN-XX pattern.
 * Indices in "answer" start at 0. Text supports `code` and **bold**.
 */
CCNA.registerDay({
  day: 23,
  title: 'EtherChannel',
  titleRu: 'EtherChannel',
  topics: ['LACP', 'PAgP', 'Static EtherChannel'],
  questions: [
    // One correct answer
    {
      id: 'd23-01',
      type: 'single',
      question: 'Question text?',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      answer: 1,
      explanation: 'Почему верен вариант B.',
    },
    // Several correct answers ("Choose two." is added automatically)
    {
      id: 'd23-02',
      type: 'multi',
      question: 'Which two statements are true?',
      options: ['A', 'B', 'C', 'D', 'E'],
      answer: [0, 3],
      explanation: '…',
    },
    // Drag-and-drop matching: answer[i] is the index in targets for items[i]
    {
      id: 'd23-03',
      type: 'match',
      question: 'Match each item to its description.',
      items: ['Item 1', 'Item 2'],
      targets: ['Description of 1', 'Description of 2', 'Extra distractor'],
      answer: [0, 1],
      explanation: '…',
    },
    // Ordering: items are listed in the CORRECT order, the app shuffles them
    {
      id: 'd23-04',
      type: 'order',
      question: 'Put the steps in order.',
      items: ['Step 1', 'Step 2', 'Step 3'],
      explanation: '…',
    },
    // Typed answer (case and extra spaces are ignored); list all accepted variants
    {
      id: 'd23-05',
      type: 'fill',
      question: 'Type the command that ...',
      answer: ['show ip route', 'sh ip route'],
      explanation: '…',
    },
    // Any type can have an exhibit (CLI output, topology) shown in a terminal block
    {
      id: 'd23-06',
      type: 'single',
      exhibit: 'R1# show ip interface brief\n...',
      question: 'Refer to the exhibit. ...?',
      options: ['A', 'B', 'C', 'D'],
      answer: 0,
      explanation: '…',
    },
  ],
  // Optional: generators create new random questions for every exam.
  // make(R) gets helpers R.int(min, max), R.pick(arr), R.shuffle(arr), R.choice(correct, distractors);
  // CCNA.ipv4 has toInt / toStr / network / broadcast / maskStr helpers.
  generators: [],
  // Optional: practical CLI labs. Checks run against the final device state.
  labs: [
    {
      id: 'lab-d23-example',
      kind: 'sim', // 'sim' = configure devices, 'simlet' = answer questions from show output
      title: 'Example lab',
      minutes: 10,
      scenario: 'Что нужно сделать (поддерживается `code` и **bold**).',
      topology: 'PC1 ── G0/1 R1',
      devices: [
        { name: 'R1', kind: 'router', ifaces: ['g0/0-1'], start: 'U', setup: ['interface g0/0', 'no shutdown'] },
        { name: 'PC1', kind: 'pc', ip: '192.168.1.10', gw: '192.168.1.1' },
      ],
      links: [['PC1', 'nic', 'R1', 'g0/1']],
      tasks: [
        { text: 'G0/1: 192.168.1.1/24, интерфейс включён.', check: (H) => H.ip('R1', 'g0/1') === '192.168.1.1/24' && H.up('R1', 'g0/1') },
        { text: 'PC1 пингует R1.', check: (H) => H.ping('PC1', '192.168.1.1') },
      ],
      questions: [{ text: 'Сколько usable хостов в /24?', answer: ['254'] }],
      solution: { R1: ['enable', 'configure terminal', 'interface g0/1', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'end'] },
    },
  ],
});
