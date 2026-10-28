// Renders the Bridge UI kit page. The shell (navigation, headers, showcase
// frames) is fixed and always uses `kit-` classes; foundations and components
// come from the project. A section and its navigation entry exist only when
// the project supplies data for it.
const { h, serializeHtml, createStylesheet } = require('./markup');

// Taptop fonts are referenced by bare name; it keeps no fallback list.
const MONO = 'JetBrains Mono';
const C = {
  white: '#ffffff', g50: '#fafafa', g100: '#f3f3f3', g150: '#ebebeb', g200: '#dedede', g300: '#c7c7c7',
  g400: '#9e9e9e', g500: '#747474', g600: '#525252', g700: '#333333', g800: '#1b1b1b', g900: '#090909', g950: '#020202'
};

const FOUNDATIONS = [
  { id: 'colors', title: 'Color', description: 'Every color used on the site, with its value.' },
  { id: 'type', title: 'Typography', description: 'Text styles. The left column is the class to apply to a text block.' },
  { id: 'spacing', title: 'Spacing', description: 'Spacing steps for padding and gaps, in pixels.' },
  { id: 'radius', title: 'Radius', description: 'Corner radius steps.' },
  { id: 'elevation', title: 'Elevation', description: 'Shadows for raised surfaces.' },
  { id: 'icons', title: 'Iconography' }
];

function fontStack(family) {
  if (!family || /["';{}]/.test(family)) throw new Error('UI_KIT_FONT: primary font family must be a plain name');
  return family;
}

function slug(value) {
  const result = String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!result) throw new Error(`UI_KIT_NAME: ${JSON.stringify(value)} cannot become a class name`);
  return result;
}

function isDark(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return false;
  const [r, g, b] = [0, 2, 4].map(offset => parseInt(match[1].slice(offset, offset + 2), 16) / 255)
    .map(channel => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}

function shellStyles(css, primary) {
  const sans = fontStack(primary);
  css.rule('.kit', { display: 'grid', 'grid-template-columns': '260px minmax(0, 1fr)', 'min-height': '100vh', 'background-color': C.white, color: C.g950, 'font-family': sans }, { 991: { 'grid-template-columns': 'minmax(0, 1fr)' } });
  css.rule('.kit-sidebar', { position: 'sticky', top: '0px', 'align-self': 'start', height: '100vh', 'box-sizing': 'border-box', 'overflow-y': 'auto', display: 'flex', 'flex-direction': 'column', 'row-gap': '28px', 'padding-top': '28px', 'padding-right': '20px', 'padding-bottom': '28px', 'padding-left': '20px', 'border-right-width': '1px', 'border-right-style': 'solid', 'border-right-color': C.g150, 'background-color': C.white }, { 991: { display: 'none' } });
  css.rule('.kit-backdrop', { display: 'none' });
  // The menu behavior (embed script) toggles is-open on .kit below 992px:
  // the sidebar slides in as a drawer over a dimmed page, as in the reference.
  css.raw(`@media (max-width: 991px) {
  .kit.is-open .kit-sidebar { display: flex; position: fixed; top: 0; left: 0; bottom: 0; z-index: 40; width: 280px; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.16); }
  .kit.is-open .kit-backdrop { display: block; position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 39; background-color: rgba(0, 0, 0, 0.4); }
}`);
  css.rule('.kit-brand', { display: 'flex', 'flex-direction': 'column', 'row-gap': '4px' });
  css.rule('.kit-brand-name', { 'font-size': '16px', 'font-weight': '800', 'line-height': '1.2', 'letter-spacing': '-0.01em' });
  css.rule('.kit-brand-meta', { 'font-family': MONO, 'font-size': '12px', color: C.g500 });
  css.rule('.kit-nav', { display: 'flex', 'flex-direction': 'column', 'row-gap': '20px' });
  css.rule('.kit-nav-group', { display: 'flex', 'flex-direction': 'column' });
  css.rule('.kit-nav-title', { 'font-size': '11px', 'font-weight': '600', 'letter-spacing': '0.06em', 'text-transform': 'uppercase', color: C.g400, 'margin-bottom': '8px' });
  css.rule('.kit-nav-link', { display: 'block', 'padding-top': '6px', 'padding-right': '8px', 'padding-bottom': '6px', 'padding-left': '8px', 'border-radius': '6px', 'font-size': '13px', 'line-height': '1.4', color: C.g700, 'text-decoration': 'none' });
  css.rule('.kit-sidebar-note', { 'margin-top': 'auto', 'font-size': '11px', 'line-height': '1.5', color: C.g400 });

  css.rule('.kit-topbar', { display: 'none' }, { 991: { display: 'flex', position: 'sticky', top: '0px', 'z-index': '30', 'align-items': 'center', 'justify-content': 'space-between', 'column-gap': '12px', 'padding-top': '12px', 'padding-right': '24px', 'padding-bottom': '12px', 'padding-left': '24px', 'background-color': C.white, 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': C.g150 }, 479: { 'padding-right': '16px', 'padding-left': '16px' } });
  css.rule('.kit-topbar-brand', { display: 'flex', 'align-items': 'baseline', 'column-gap': '8px' });
  css.rule('.kit-topbar-name', { 'font-size': '15px', 'font-weight': '800' });
  css.rule('.kit-topbar-meta', { 'font-family': MONO, 'font-size': '11px', color: C.g500 });
  css.rule('.kit-burger', { 'box-sizing': 'border-box', display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center', 'row-gap': '4px', width: '44px', height: '44px', 'border-width': '1px', 'border-style': 'solid', 'border-color': C.g200, 'border-radius': '6px', 'background-color': C.white, cursor: 'pointer' });
  css.rule('.kit-burger-line', { width: '16px', height: '2px', 'background-color': C.g950 });

  css.rule('.kit-main', { 'box-sizing': 'border-box', width: '100%', 'max-width': '1140px', 'min-width': '0px', 'padding-top': '56px', 'padding-right': '64px', 'padding-bottom': '120px', 'padding-left': '64px' }, {
    991: { 'padding-top': '48px', 'padding-right': '40px', 'padding-bottom': '96px', 'padding-left': '40px' },
    767: { 'padding-top': '40px', 'padding-right': '24px', 'padding-bottom': '80px', 'padding-left': '24px' },
    479: { 'padding-top': '28px', 'padding-right': '16px', 'padding-bottom': '64px', 'padding-left': '16px' }
  });
  css.rule('.kit-hero', { 'margin-bottom': '72px' }, { 767: { 'margin-bottom': '56px' }, 479: { 'margin-bottom': '48px' } });
  css.rule('.kit-eyebrow', { 'font-family': MONO, 'font-size': '12px', color: C.g500, 'margin-bottom': '12px' });
  css.rule('.kit-title', { 'font-size': '52px', 'font-weight': '800', 'line-height': '1.05', 'letter-spacing': '-0.02em', margin: '0px', 'margin-bottom': '16px' }, { 991: { 'font-size': '46px' }, 767: { 'font-size': '40px' }, 479: { 'font-size': '34px' } });
  css.rule('.kit-lead', { 'max-width': '620px', margin: '0px', 'font-size': '17px', 'line-height': '1.6', color: C.g600 }, { 767: { 'font-size': '16px' }, 479: { 'font-size': '15px' } });

  css.rule('.kit-section', { 'margin-bottom': '80px' }, { 767: { 'margin-bottom': '64px' }, 479: { 'margin-bottom': '56px' } });
  css.rule('.kit-section-title', { margin: '0px', 'margin-bottom': '20px', 'font-size': '13px', 'font-weight': '600', 'line-height': '1.4', 'letter-spacing': '0.06em', 'text-transform': 'uppercase', color: C.g400 });
  css.rule('.kit-section-text', { 'max-width': '560px', margin: '0px', 'margin-top': '-12px', 'margin-bottom': '20px', 'font-size': '13px', 'line-height': '1.5', color: C.g500 });
  css.rule('.kit-subtitle', { 'margin-bottom': '16px', 'font-size': '13px', 'font-weight': '600', color: C.g600 });
  css.rule('.kit-group', { 'margin-bottom': '32px' });
  css.rule('.kit-group--last', { 'margin-bottom': '0px' });
  css.rule('.kit-caption', { 'font-family': MONO, 'font-size': '11px', 'line-height': '1.4', color: C.g500 });
  css.rule('.kit-panel', { display: 'flex', 'flex-direction': 'column', 'row-gap': '24px', 'padding-top': '28px', 'padding-right': '28px', 'padding-bottom': '28px', 'padding-left': '28px', 'border-width': '1px', 'border-style': 'solid', 'border-color': C.g150, 'border-radius': '10px', 'background-color': C.g50 }, {
    767: { 'padding-top': '20px', 'padding-right': '20px', 'padding-bottom': '20px', 'padding-left': '20px' },
    479: { 'padding-top': '16px', 'padding-right': '16px', 'padding-bottom': '16px', 'padding-left': '16px' }
  });
  css.rule('.kit-panel--plain', { 'background-color': C.white });
  css.rule('.kit-row', { display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'wrap', 'align-items': 'center', 'column-gap': '12px', 'row-gap': '12px' });
  css.rule('.kit-stack', { display: 'flex', 'flex-direction': 'column', 'row-gap': '12px' });
  css.rule('.kit-grid', { display: 'grid', 'grid-template-columns': 'repeat(3, minmax(0, 1fr))', 'column-gap': '20px', 'row-gap': '20px' }, { 991: { 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' }, 479: { 'grid-template-columns': 'minmax(0, 1fr)' } });
  css.rule('.kit-grid--3', { display: 'grid', 'grid-template-columns': 'repeat(3, minmax(0, 1fr))', 'column-gap': '24px', 'row-gap': '24px' }, { 991: { 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' }, 479: { 'grid-template-columns': 'minmax(0, 1fr)' } });
  css.rule('.kit-grid--2', { display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', 'column-gap': '24px', 'row-gap': '24px' }, { 767: { 'grid-template-columns': 'minmax(0, 1fr)' } });
  css.rule('.kit-columns', { display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'wrap', 'column-gap': '56px', 'row-gap': '28px' }, { 479: { 'column-gap': '32px' } });
  css.rule('.kit-column', { display: 'flex', 'flex-direction': 'column', 'row-gap': '14px' });
  css.rule('.kit-column-title', { 'font-size': '12px', 'font-weight': '600', 'letter-spacing': '0.04em', 'text-transform': 'uppercase', color: C.g500 });
}

function colorSection(kit, css) {
  const groups = (kit.colors || []).filter(group => group.items?.length);
  if (!groups.length) return null;
  const nodes = groups.map((group, groupIndex) => {
    const items = group.items.map(item => {
      const colorClass = `kit-color-${slug(item.name)}`;
      if (!css.has(`.${colorClass}`)) css.rule(`.${colorClass}`, { 'background-color': item.value });
      return { ...item, colorClass };
    });
    if (group.layout === 'ramp') {
      const count = items.length;
      const ramp = `kit-ramp-${groupIndex + 1}`;
      // The reference fills 84px+ cells: 11 per row on a desktop canvas, 4 on a phone.
      css.rule(`.${ramp}`, { 'grid-template-columns': `repeat(${Math.min(count, 11)}, minmax(0, 1fr))` }, {
        991: { 'grid-template-columns': `repeat(${Math.min(count, 6)}, minmax(0, 1fr))` },
        479: { 'grid-template-columns': `repeat(${Math.min(count, 4)}, minmax(0, 1fr))` }
      });
      return h('div', groupIndex === groups.length - 1 ? ['kit-group', 'kit-group--last'] : 'kit-group', [
        h('div', 'kit-subtitle', group.title),
        h('div', ['kit-ramp', ramp], items.map(item => h('div', ['kit-swatch', item.colorClass], [
          h('span', isDark(item.value) ? ['kit-swatch-label', 'kit-swatch-label--light'] : 'kit-swatch-label', item.name)
        ])))
      ]);
    }
    return h('div', groupIndex === groups.length - 1 ? ['kit-group', 'kit-group--last'] : 'kit-group', [
      h('div', 'kit-subtitle', group.title),
      h('div', 'kit-tokens', items.map(item => h('div', 'kit-token', [
        h('div', ['kit-token-preview', item.colorClass], []),
        h('div', 'kit-token-body', [
          h('div', 'kit-token-name', item.name),
          h('div', 'kit-caption', item.note || item.value)
        ])
      ])))
    ]);
  });
  css.rule('.kit-ramp', { display: 'grid', 'column-gap': '1px', 'row-gap': '1px', overflow: 'hidden', 'border-width': '1px', 'border-style': 'solid', 'border-color': C.g150, 'border-radius': '10px', 'background-color': C.white });
  css.rule('.kit-swatch', { 'box-sizing': 'border-box', display: 'flex', 'flex-direction': 'column', 'align-items': 'flex-start', 'padding-top': '20px', 'padding-right': '14px', 'padding-bottom': '20px', 'padding-left': '14px' });
  css.rule('.kit-swatch-label', { 'font-family': MONO, 'font-size': '11px', color: C.g500 });
  css.rule('.kit-swatch-label--light', { color: C.white });
  css.rule('.kit-tokens', { display: 'grid', 'grid-template-columns': 'repeat(4, minmax(0, 1fr))', 'column-gap': '16px', 'row-gap': '16px' }, { 991: { 'grid-template-columns': 'repeat(3, minmax(0, 1fr))' }, 767: { 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' } });
  css.rule('.kit-token', { overflow: 'hidden', 'border-width': '1px', 'border-style': 'solid', 'border-color': C.g150, 'border-radius': '10px', 'background-color': C.white });
  css.rule('.kit-token-preview', { 'box-sizing': 'border-box', height: '64px', 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': C.g150 });
  css.rule('.kit-token-body', { 'padding-top': '10px', 'padding-right': '12px', 'padding-bottom': '10px', 'padding-left': '12px' });
  css.rule('.kit-token-name', { 'font-size': '13px', 'font-weight': '600', 'line-height': '1.4' });
  return nodes;
}

function typeSection(kit, css) {
  const rows = kit.typography || [];
  if (!rows.length) return null;
  css.rule('.kit-type-list', { display: 'flex', 'flex-direction': 'column', 'border-width': '1px', 'border-style': 'solid', 'border-color': C.g150, 'border-radius': '10px' });
  css.rule('.kit-type-row', { display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'baseline', 'column-gap': '16px', 'row-gap': '6px', 'padding-top': '16px', 'padding-right': '20px', 'padding-bottom': '16px', 'padding-left': '20px', 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': C.g150 }, { 479: { 'padding-right': '14px', 'padding-left': '14px' } });
  // The reference gives the display row 20px and heading rows 18px of air.
  css.rule('.kit-type-row--display', { 'padding-top': '20px', 'padding-bottom': '20px' });
  css.rule('.kit-type-row--heading', { 'padding-top': '18px', 'padding-bottom': '18px' });
  css.rule('.kit-type-row--last', { 'border-bottom-width': '0px' });
  css.rule('.kit-type-class', { width: '90px', 'flex-shrink': '0', 'font-family': MONO, 'font-size': '11px', color: C.g500 }, { 479: { width: '100%' } });
  css.rule('.kit-type-sample', { 'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': '280px', 'min-width': '0px' }, { 479: { 'flex-basis': '100%' } });
  css.rule('.kit-type-spec', { 'flex-shrink': '0', 'font-family': MONO, 'font-size': '11px', color: C.g500, 'text-align': 'right' }, { 479: { 'text-align': 'left' } });
  const kindOf = row => row.kind || (/display/.test(row.className) ? 'display' : /(^|-)h\d$/.test(row.className) ? 'heading' : 'text');
  return h('div', 'kit-type-list', rows.map((row, index) => h('div', ['kit-type-row', kindOf(row) !== 'text' ? `kit-type-row--${kindOf(row)}` : null, index === rows.length - 1 ? 'kit-type-row--last' : null].filter(Boolean), [
    h('span', 'kit-type-class', `.${row.className}`),
    h('span', ['kit-type-sample', row.className], row.sample || 'Aa Design system'),
    h('span', 'kit-type-spec', row.spec || '')
  ])));
}

function spacingSection(kit, css) {
  const steps = kit.spacing || [];
  if (!steps.length) return null;
  css.rule('.kit-space-list', { display: 'flex', 'flex-direction': 'column', 'row-gap': '10px' });
  css.rule('.kit-space-row', { display: 'flex', 'align-items': 'center', 'column-gap': '16px' });
  css.rule('.kit-space-value', { width: '36px', 'flex-shrink': '0', 'font-family': MONO, 'font-size': '12px', color: C.g500 });
  css.rule('.kit-space-bar', { height: '14px', 'border-radius': '2px', 'background-color': C.g900 });
  return h('div', 'kit-space-list', steps.map(step => {
    const size = `kit-space-${Number(step)}`;
    if (!css.has(`.${size}`)) css.rule(`.${size}`, { width: `${Number(step)}px` });
    return h('div', 'kit-space-row', [h('span', 'kit-space-value', String(step)), h('div', ['kit-space-bar', size], [])]);
  }));
}

function radiusSection(kit, css) {
  const steps = kit.radius || [];
  if (!steps.length) return null;
  css.rule('.kit-swatch-row', { display: 'flex', 'flex-wrap': 'wrap', 'column-gap': '20px', 'row-gap': '20px' });
  css.rule('.kit-swatch-item', { display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'row-gap': '8px' });
  css.rule('.kit-radius-box', { 'box-sizing': 'border-box', width: '72px', height: '72px', 'border-width': '1px', 'border-style': 'solid', 'border-color': C.g200, 'background-color': C.g100 });
  return h('div', 'kit-swatch-row', steps.map(step => {
    const radius = `kit-radius-${slug(step.label)}`;
    css.rule(`.${radius}`, { 'border-radius': step.value });
    return h('div', 'kit-swatch-item', [h('div', ['kit-radius-box', radius], []), h('span', 'kit-caption', step.label)]);
  }));
}

function elevationSection(kit, css) {
  const steps = kit.shadows || [];
  if (!steps.length) return null;
  css.rule('.kit-shadow-row', { display: 'flex', 'flex-wrap': 'wrap', 'column-gap': '32px', 'row-gap': '24px' });
  css.rule('.kit-shadow-item', { display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'row-gap': '10px' });
  css.rule('.kit-shadow-box', { width: '100px', height: '70px', 'border-radius': '10px', 'background-color': C.white });
  return h('div', 'kit-shadow-row', steps.map(step => {
    const shadow = `kit-shadow-${slug(step.label)}`;
    css.rule(`.${shadow}`, { 'box-shadow': step.value });
    return h('div', 'kit-shadow-item', [h('div', ['kit-shadow-box', shadow], []), h('span', 'kit-caption', step.label)]);
  }));
}

function iconSection(kit, css) {
  const icons = kit.icons || [];
  if (!icons.length) return null;
  css.rule('.kit-icon-row', { display: 'flex', 'flex-wrap': 'wrap', 'column-gap': '24px', 'row-gap': '20px' });
  css.rule('.kit-icon-item', { display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'row-gap': '8px', 'min-width': '44px' });
  css.rule('.kit-icon-frame', { display: 'flex', 'align-items': 'center', 'justify-content': 'center', width: '24px', height: '24px' });
  return h('div', 'kit-icon-row', icons.map(icon => h('div', 'kit-icon-item', [
    h('div', 'kit-icon-frame', [icon.node]),
    h('span', 'kit-caption', icon.label)
  ])));
}

const FOUNDATION_RENDERERS = { colors: colorSection, type: typeSection, spacing: spacingSection, radius: radiusSection, elevation: elevationSection, icons: iconSection };

function section(id, title, description, content) {
  return h('section', ['kit-section', `kit-section--${id}`], [
    h('h2', 'kit-section-title', title),
    description ? h('p', 'kit-section-text', description) : null,
    content
  ]);
}

function renderUiKit(kit) {
  const css = createStylesheet();
  const primary = kit.fonts?.primary;
  shellStyles(css, primary);
  if (typeof kit.componentStyles === 'function') kit.componentStyles(css, { sans: fontStack(primary), mono: MONO });
  // A project's own role classes (type-*, btn, …) keep their exact source CSS.
  if (kit.projectCss) css.raw(kit.projectCss);

  const foundations = FOUNDATIONS.map(meta => ({ ...meta, content: FOUNDATION_RENDERERS[meta.id](kit, css) })).filter(item => item.content);
  const components = (kit.components || []).filter(item => item.content?.length).map(item => ({ ...item, id: slug(item.id) }));
  const navGroup = (title, items) => items.length ? h('div', 'kit-nav-group', [
    h('div', 'kit-nav-title', title),
    items.map(item => h('a', 'kit-nav-link', item.title, { href: `#${item.id}` }))
  ]) : null;
  const name = kit.projectName || 'Project';

  const root = h('div', 'kit', [
    h('div', 'kit-backdrop', []),
    h('aside', 'kit-sidebar', [
      h('div', 'kit-brand', [h('div', 'kit-brand-name', name), h('div', 'kit-brand-meta', 'UI Kit')]),
      h('nav', 'kit-nav', [navGroup('Foundations', foundations), navGroup('Components', components)]),
      h('div', 'kit-sidebar-note', `${primary} · JetBrains Mono`)
    ]),
    h('div', 'kit-topbar', [
      h('div', 'kit-topbar-brand', [h('span', 'kit-topbar-name', name), h('span', 'kit-topbar-meta', 'UI Kit')]),
      h('div', 'kit-burger', [h('span', 'kit-burger-line', []), h('span', 'kit-burger-line', []), h('span', 'kit-burger-line', [])])
    ]),
    h('main', 'kit-main', [
      h('header', 'kit-hero', [
        h('div', 'kit-eyebrow', name.toUpperCase()),
        h('h1', 'kit-title', 'UI Kit'),
        h('p', 'kit-lead', 'The colors, type and components this site is built from. Build pages from these classes — when a class changes here, it changes everywhere it is used.')
      ]),
      foundations.map(item => section(item.id, item.title, item.description, item.content)),
      components.map(item => section(item.id, item.title, item.description, item.content))
    ])
  ], { 'data-taptop-behavior': 'menu', 'data-taptop-anchor-prefix': 'kit-section--' });

  return { html: serializeHtml(root), css: css.toString(), sections: [...foundations, ...components].map(item => item.id) };
}

function googleFontsHref(families) {
  const query = families.map(family => `family=${family.trim().replace(/\s+/g, '+')}:wght@400;500;600;700;800`).join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

function renderUiKitDocument(kit, { stylesheet = 'ui-kit.css' } = {}) {
  const { html, css, sections } = renderUiKit(kit);
  const document = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI Kit</title>
<link rel="stylesheet" href="${googleFontsHref([kit.fonts.primary, 'JetBrains Mono'])}">
<link rel="stylesheet" href="${stylesheet}">
</head>
<body class="kit-page">
${html}
</body>
</html>
`;
  return { html: document, css: `.kit-page {\n  margin: 0px;\n}\n\n${css}`, sections };
}

module.exports = { renderUiKit, renderUiKitDocument, FOUNDATIONS, C, MONO };
