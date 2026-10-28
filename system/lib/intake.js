const { isSafeRelativePath } = require('./html-ir-contract');

const MODES = new Set(['figma-with-kit', 'figma-without-kit', 'ai-generated', 'html']);
const EVIDENCE = ['foundations', 'components', 'responsive-variants', 'assets', 'states'];

function issue(code, message) { return { code, message }; }
function isFigmaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'figma.com' || url.hostname.endsWith('.figma.com'));
  } catch { return false; }
}

function validateIntake(intake) {
  const errors = [];
  const warnings = [];
  const mode = intake?.sourceType;
  if (intake?.schemaVersion !== 1) errors.push(issue('UNSUPPORTED_INTAKE_SCHEMA', 'Поддерживается только intake schemaVersion 1.'));
  if (!MODES.has(mode)) errors.push(issue('INVALID_SOURCE_TYPE', 'sourceType должен быть figma-with-kit, figma-without-kit, ai-generated или html.'));

  if (mode === 'ai-generated') {
    const ai = intake?.ai || {};
    if (typeof ai.brief !== 'string' || !ai.brief.trim()) errors.push(issue('MISSING_BRIEF', 'Для AI-дизайна нужен краткий brief.'));
    if (typeof ai.visualDirection !== 'string' || !ai.visualDirection.trim() || ai.approved !== true) {
      errors.push(issue('MISSING_APPROVED_DIRECTION', 'Для AI-дизайна нужно подтверждённое визуальное направление.'));
    }
  }

  if (mode === 'figma-with-kit' || mode === 'figma-without-kit') {
    const figma = intake?.figma || {};
    if (!isFigmaUrl(figma.fileUrl)) errors.push(issue('MISSING_FIGMA_FILE', 'Укажите HTTPS-ссылку на Figma-файл в figma.fileUrl.'));
    if (!Array.isArray(figma.screens) || figma.screens.length === 0 || figma.screens.some(item => typeof item !== 'string' || !item.trim())) {
      errors.push(issue('MISSING_SCREENS', 'Укажите хотя бы один экран в figma.screens.'));
    }
    if (mode === 'figma-with-kit') {
      if (!['same-file', 'separate-file'].includes(figma.uiKit?.location)) {
        errors.push(issue('MISSING_UI_KIT_LOCATION', 'Для Figma с UI kit укажите figma.uiKit.location: same-file или separate-file.'));
      }
      if (figma.uiKit?.location === 'separate-file' && !isFigmaUrl(figma.uiKit?.fileUrl)) {
        errors.push(issue('MISSING_UI_KIT_FILE', 'Для отдельного UI kit укажите HTTPS-ссылку figma.uiKit.fileUrl.'));
      }
    }
    if (mode === 'figma-without-kit') {
      if (intake?.foundationStrategy !== 'extract-from-screens') {
        errors.push(issue('MISSING_FOUNDATION_STRATEGY', 'Для Figma без UI kit укажите foundationStrategy: extract-from-screens.'));
      }
      warnings.push(issue('MISSING_UI_KIT', 'UI kit не найден: foundations и компоненты нужно извлечь из экранов и отметить недостающие значения.'));
    }
  }

  if (mode === 'html') {
    const html = intake?.html || {};
    if (typeof html.entry !== 'string' || !isSafeRelativePath(html.entry) || !html.entry.endsWith('.html')) {
      errors.push(issue('INVALID_HTML_ENTRY', 'html.entry должен быть безопасным относительным путём к .html-файлу.'));
    }
    if (!Array.isArray(html.stylesheets) || html.stylesheets.length === 0 || html.stylesheets.some(file => typeof file !== 'string' || !isSafeRelativePath(file) || !file.endsWith('.css'))) {
      errors.push(issue('MISSING_STYLESHEETS', 'html.stylesheets должен содержать хотя бы один безопасный относительный путь к .css-файлу.'));
    }
    // Swiper options from the source script (Swiper's option names); the
    // normalizer checks which of them the generated slider reproduces.
    if (html.sliders !== undefined) {
      const sliders = Array.isArray(html.sliders) ? html.sliders : [null];
      const bad = sliders.some(item => !item || typeof item !== 'object' || Array.isArray(item)
        || !/^\.[_a-zA-Z-][_a-zA-Z0-9-]*$/.test(item.selector || '')
        || (item.source !== undefined && (typeof item.source !== 'string' || !isSafeRelativePath(item.source)))
        || ['spaceBetween', 'initialSlide', 'speed'].some(key => item[key] !== undefined && !(typeof item[key] === 'number' && item[key] >= 0))
        || (item.breakpoints !== undefined && (!item.breakpoints || typeof item.breakpoints !== 'object' || Array.isArray(item.breakpoints))));
      const selectors = sliders.map(item => item?.selector);
      if (bad || new Set(selectors).size !== selectors.length) {
        errors.push(issue('INVALID_SLIDER_OPTIONS', 'html.sliders — массив { selector: ".класс-swiper", …опции Swiper } с уникальными селекторами из одного класса и неотрицательными числами.'));
      }
    }
  }

  return { valid: errors.length === 0, mode: MODES.has(mode) ? mode : null, requiredEvidence: MODES.has(mode) ? EVIDENCE : [], errors, warnings };
}

module.exports = { validateIntake };
