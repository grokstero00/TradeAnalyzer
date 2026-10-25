/*
 * Template for a new course day.
 * 1. Copy this file to dayNN.js (for example day13.js).
 * 2. Fill in day, title and questions.
 * 3. Add 'day13.js' to the list in days/manifest.js.
 * IDs must be unique across the whole bank: use the dNN-XX pattern.
 * Indices in "answer" start at 0. Text supports `code` and **bold**.
 */
CCNA.registerDay({
  day: 13,
  title: 'Life of a Packet',
  titleRu: 'Жизнь пакета',
  topics: ['ARP', 'Encapsulation per hop'],
  questions: [
    // One correct answer
    {
      id: 'd13-01',
      type: 'single',
      question: 'Question text?',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      answer: 1,
      explanation: 'Почему верен вариант B.',
    },
    // Several correct answers ("Choose two." is added automatically)
    {
      id: 'd13-02',
      type: 'multi',
      question: 'Which two statements are true?',
      options: ['A', 'B', 'C', 'D', 'E'],
      answer: [0, 3],
      explanation: '…',
    },
    // Drag-and-drop matching: answer[i] is the index in targets for items[i]
    {
      id: 'd13-03',
      type: 'match',
      question: 'Match each item to its description.',
      items: ['Item 1', 'Item 2'],
      targets: ['Description of 1', 'Description of 2', 'Extra distractor'],
      answer: [0, 1],
      explanation: '…',
    },
    // Ordering: items are listed in the CORRECT order, the app shuffles them
    {
      id: 'd13-04',
      type: 'order',
      question: 'Put the steps in order.',
      items: ['Step 1', 'Step 2', 'Step 3'],
      explanation: '…',
    },
    // Typed answer (case and extra spaces are ignored); list all accepted variants
    {
      id: 'd13-05',
      type: 'fill',
      question: 'Type the command that ...',
      answer: ['show ip route', 'sh ip route'],
      explanation: '…',
    },
    // Any type can have an exhibit (CLI output, topology) shown in a terminal block
    {
      id: 'd13-06',
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
});
