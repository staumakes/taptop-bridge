# Входные данные проекта

Сначала выбери проект (`npm run toolkit -- projects`; при нескольких проектах спроси пользователя). До извлечения макета создай intake для того артефакта, который будешь собирать, — например `input/home/intake.json`, взяв один из примеров, которые `init` кладёт в `source/intake.*.example.json`. У одного проекта может быть несколько intake: страница из Figma и страница из HTML используют одну дизайн-систему проекта. Проверка:

```sh
npm run toolkit -- intake projects/my-site input/home/intake.json
```

Команда только проверяет декларацию и выводит отчёт. Она не открывает Figma, не читает файлы по ссылке, не меняет состояние проекта и не начинает сборку. Чтобы сборка проверяла intake каждый раз, укажи его при регистрации артефакта: `npm run toolkit -- artifact add … --intake input/home/intake.json`. Сборка с неполным intake останавливается с `INVALID_INTAKE`.

## Figma с UI kit

Укажи ссылку на макет, список экранов, которые войдут в работу, и где находится UI kit: в том же файле (`same-file`) либо в отдельном (`separate-file`, тогда нужна `figma.uiKit.fileUrl`). После проверки собери evidence: foundations, компоненты, адаптивные варианты, assets и состояния.

## Figma без UI kit

Укажи ссылку и экраны, а также `foundationStrategy: extract-from-screens`. Валидатор сознательно оставляет предупреждение `MISSING_UI_KIT`: цвета, типографику, интервалы и повторяющиеся компоненты необходимо извлечь из реальных экранов либо отметить как MISSING.

## AI-generated

Укажи brief, визуальное направление и `ai.approved: true`. Новые значения и компоненты появляются только после подтверждённого направления; их источник записывается в evidence. Этот режим не означает точную передачу Figma.

## HTML/CSS

Положи присланные файлы без изменений в `input/<имя>/` (HTML, CSS и изображения рядом с HTML или во вложенных папках) и укажи в intake безопасные относительные пути к HTML и хотя бы одному CSS-файлу. Затем зарегистрируй артефакт с теми же файлами; если страница использует UI-kit проекта, первым стилем указывается `design-system/roles.css` и добавляется `--depends ui-kit`. Intake — входной контракт; он отдельный от манифеста компилятора, который сборка создаёт сама.

### Слайдеры Swiper

Шаг слайдов, стартовый слайд, центрирование и петлю Swiper хранит не в разметке, а в скрипте страницы; скрипт в Taptop не переносится. Перепиши опции каждого `new Swiper(…)` из исходного скрипта в `html.sliders` — по одной записи на элемент `.swiper`, имена опций как у Swiper:

```json
"sliders": [
  { "selector": ".cards__swiper", "source": "input/home/app.js", "slidesPerView": "auto", "spaceBetween": 16, "breakpoints": { "480": { "spaceBetween": 20 } } },
  { "selector": ".reviews__swiper", "slidesPerView": "auto", "centeredSlides": true, "initialSlide": 1, "spaceBetween": 20, "speed": 480 }
]
```

`selector` — один класс элемента `.swiper`. Поддерживаются `slidesPerView` (`"auto"` или число 1–8), `slidesPerGroup: 1`, `spaceBetween`, `breakpoints` (только `spaceBetween` и `slidesPerView`, ширины 480/768/992 — границы холстов Taptop), `centeredSlides`, `initialSlide`, `loop`, `speed`; остальное останавливает сборку (`SWIPER_OPTION_UNSUPPORTED`). Без записи сборка предупреждает `SWIPER_OPTIONS_UNDECLARED` и считает шаг нулевым. Если артефакт уже зарегистрирован, добавь intake командой `artifact add … --intake <файл> --replace` с теми же остальными аргументами.

Все четыре режима имеют общий внутренний контракт `foundations`, `classes`, `components`, `pages`, `evidence`, но команда `intake` только проверяет декларацию. Она не извлекает данные из Figma и не собирает страницы: извлечение выполняет агент по [figma-extraction](figma-extraction.md), а сборку — `build`. Правила повторного использования и обновления классов описаны в [контракте системы проекта](../contracts/project-system/README.md).

Независимо от входа, результат заполняет существующий каркас UI Kit Bridge из
`system/examples/ui-kit-default/source/` от корня Bridge. Входной UI-kit — это данные для этого
каркаса, а не инструкция создать другой каталог компонентов. Перед передачей
работы запиши: `base_scaffold`, заполненные роли и `MISSING` значения. Изменить
каркас можно только после явного решения пользователя и отдельного плана
миграции.

Ссылки на Figma в intake — исходные данные проекта. Не добавляй туда URL редактора Taptop с параметрами доступа, целевые ID, cookies или receipts.

## Повторное использование UI Kit

Страница обязана применять точные классы UI Kit проекта. Полное правило — в корневом `AGENTS.md` («Жёсткое правило: страница обязана переиспользовать UI Kit»); управляемая сборка проверяет совпадение правил (`UI_KIT_CLASS_MISMATCH`, `CLASS_RULE_CONFLICT`, `RESERVED_CLASS_NAME`).
