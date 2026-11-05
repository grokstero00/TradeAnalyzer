# CCNA Exam Simulator

Тренажёр экзамена CCNA 200-301 в стиле Boson ExSim, привязанный к дням курса
**Jeremy's IT Lab — Free CCNA**. Нумерация дней совпадает с плейлистом на YouTube
(Day 11 состоит из двух видео: Routing Fundamentals и Static Routing). Сейчас в банке дни 1–22:
314 вопросов, генераторы задач (двоичные числа, адреса, сабнеттинг, VLSM, выбор root bridge,
`root primary`) и 20 лабораторных работ в эмуляторе Cisco IOS.

Содержание дней 18–22 сверено с конспектом курса
[psaumur/CCNA_Course_Notes](https://github.com/psaumur/CCNA_Course_Notes). Вопросы и лабы
написаны по материалу уроков, но это не копии вопросов и лаб из курса.

Работает без сборки и без сервера: откройте `index.html` в браузере.

## Возможности

- **Режим «Экзамен»**: таймер (по умолчанию 1.2 мин на вопрос, как на реальном CCNA),
  ответы и пояснения показываются только после завершения.
- **Режим «Обучение»**: без таймера, кнопка «Проверить» сразу показывает ответ и пояснение.
- Типы вопросов как на экзамене: один ответ, несколько ответов (Choose two/three),
  drag-and-drop сопоставление, упорядочивание, ввод команды или значения, вопросы с exhibit (вывод CLI).
- **Лабораторные работы (симуляции)** в эмуляторе CLI: роутеры, коммутаторы и ПК в одной топологии.
  Задание проверяется по итоговому состоянию устройств и реальной связности (ping идёт по топологии).
  Лабы есть на вкладке «Практика» и попадают в экзамен (от 0 до 5 на экзамен, отдельное время на каждую).
- Отметка вопросов для проверки, экран обзора (Item Review), навигация вперёд и назад.
- Результат по шкале 0–1000 с проходным баллом (по умолчанию 825), разбивка по дням,
  разбор каждого вопроса с пояснением, кнопка «Повторить ошибки».
- Выбор дней, количества вопросов, фильтры «только новые» и «только ошибки».
- История экзаменов, прогресс по каждому дню, банк вопросов с ответами.
- Незавершённый экзамен сохраняется: его можно продолжить после перезагрузки страницы.
- Клавиши: `A`–`E` выбрать вариант, `←` `→` листать, `M` отметить, `Enter` проверить (режим обучения).

Всё хранится в `localStorage` браузера.

## Эмулятор CLI

Поддерживает то, что пройдено в курсе к 22-му дню:

- режимы `>` `#` `(config)#` `(config-if)#` `(config-if-range)#` `(config-subif)#` `(config-vlan)#`,
  `enable`, `disable`, `configure terminal`, `exit`, `end`, `do`;
- сокращения (`conf t`, `int g0/0`, `sh ip int br`), `?`, Tab, история ↑ ↓, сообщения об ошибках с `^`,
  фильтры `| include`, `| exclude`, `| begin`, `| section`;
- `hostname`, `enable secret`, `enable password`, `service password-encryption`, `write`, `copy run start`;
- `ip address`, `shutdown`, `description`, `speed`, `duplex`, `interface range`, `ip route` (next hop, exit interface, оба);
- `vlan`, `name`, `switchport mode access|trunk`, `switchport access vlan`, `switchport trunk encapsulation|allowed vlan|native vlan`,
  подинтерфейсы `encapsulation dot1q` (Router on a Stick);
- L3-коммутатор: `ip routing`, SVI (`interface vlan 10`), routed-порты (`no switchport`), `ip route`, `ip default-gateway`;
- DTP: `switchport mode dynamic auto|desirable`, `switchport nonegotiate`, `show interfaces X switchport`
  (режим линка вычисляется по настройкам обеих сторон);
- VTP: `vtp mode|domain|version`, `show vtp status`, синхронизация VLAN по revision number через trunk-линки;
- STP (PVST+ / Rapid PVST+): выбор root bridge, root/designated/alternate-портов по стоимости, Bridge ID и Port ID,
  `show spanning-tree [vlan N]`, `spanning-tree mode pvst|rapid-pvst|mst`, `spanning-tree vlan N priority X`,
  `spanning-tree vlan N root primary|secondary`, на интерфейсе `spanning-tree vlan N cost|port-priority`,
  `spanning-tree portfast`, `spanning-tree bpduguard enable` (порт уходит в err-disabled при получении BPDU),
  `spanning-tree link-type`, глобальные `spanning-tree portfast default` и `spanning-tree portfast bpduguard default`;
- `show running-config`, `startup-config`, `ip interface brief`, `ip route`, `interfaces [status|trunk|description]`,
  `vlan brief`, `mac address-table`, `arp`; `ping`, `clear mac address-table dynamic`;
- глобальные команды можно вводить из любого подрежима, как в IOS;
- ПК: `ipconfig`, `ping`, `arp -a`.

Ping моделирует ARP (первый ping `.!!!!`), коммутацию по VLAN и trunk, маршрутизацию по самому длинному префиксу и обратный путь.

## Структура

```
ccna-exam-sim/
├── index.html
├── css/style.css
├── js/registry.js     реестр дней, проверка формата вопросов и лаб, хелперы для генераторов
├── js/cli.js          эмулятор Cisco IOS для лабораторных работ
├── js/app.js          движок экзамена и интерфейс
└── days/
    ├── manifest.js    список файлов дней
    ├── _template.js   шаблон нового дня
    └── day01.js … day22.js
```

## Как добавить новый день курса

**Вариант 1 — файл в репозитории (навсегда):**

1. Скопируйте `days/_template.js` в `days/day23.js`.
2. Укажите `day: 23`, название и вопросы. Каждому вопросу нужен уникальный `id` (например `d23-01`).
   Номер дня берите из названия видео в плейлисте. Уже существующие `id` не меняйте:
   по ним хранится статистика, поэтому после перенумерации дней часть `id` не совпадает с номером дня.
3. Добавьте `'day23.js'` в список в `days/manifest.js`.
4. Обновите страницу. Ошибки в вопросах показываются жёлтым баннером на главной; такие вопросы пропускаются.

**Вариант 2 — импорт JSON прямо в приложении:** блок «Добавить день курса» на главной
(вставить текст или выбрать `.json`). Тот же формат, только без генераторов. Если номер дня
уже есть, вопросы добавятся к нему. Импорт хранится в этом браузере.

### Формат вопросов

| type     | Поля                                                                 |
|----------|----------------------------------------------------------------------|
| `single` | `options`, `answer` — индекс правильного варианта (с 0)               |
| `multi`  | `options`, `answer` — массив индексов; «(Choose two.)» добавляется сам |
| `match`  | `items`, `targets`, `answer[i]` — индекс target для `items[i]`; лишние targets допустимы |
| `order`  | `items` в правильном порядке; приложение перемешает их само            |
| `fill`   | `answer` — список допустимых ответов; регистр и лишние пробелы не важны |

Общие поля: `id`, `type`, `question`, `explanation`, необязательный `exhibit`
(моноширинный блок, `\n` — перенос строки). В тексте работают `` `code` `` и `**жирный**`.

### Формат лабораторной работы

Лабы описываются в JS-файле дня в массиве `labs` (пример в `days/_template.js`, полные примеры — `day12.js`, `day18.js`):

- `devices` — устройства: `kind: 'router' | 'switch' | 'pc'`, интерфейсы (`'g0/0-2'`, `'f0/1-24'`),
  `setup` — команды предварительной настройки, `start` — режим CLI в начале (`'U'` или `'P'`), `hidden: true` — устройство без консоли;
- `links` — кабели `['R1', 'g0/0', 'SW1', 'g0/1']`;
- `tasks` — задачи с функцией `check(H)`; `H` даёт `ip()`, `up()`, `ping()`, `route()`, `vlan()`, `ifc()`, `saved()`, `mac()`;
- `questions` — вопросы с ответом-строкой (simlet), `solution` — эталонные команды по устройствам.

Генераторы (`generators` в JS-файле дня) возвращают новый вопрос при каждом вызове `make(R)`.
Примеры — в `days/day07.js`, `day08.js`, `day10.js`.
