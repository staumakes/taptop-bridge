// Default "Monochrome" kit: the starter look of every new Bridge UI kit page.
// Component classes below are an ordinary starter design system (no `kit-`
// prefix): a project that supplies its own components replaces them.
// Interactive parts are shown in their resting state; behaviour is added on
// the published site through embed code, not through editor-only layers.
const { h } = require('./markup');
const { C } = require('./render');

const text = (cls, value) => h('span', cls, value);
const box = (cls, children = []) => h('div', cls, children);

function icons() {
  const line = (...cls) => box(['ico-line', ...cls]);
  return [
    { label: 'plus', node: box('ico', [line('ico-line--v'), line('ico-line--h')]) },
    { label: 'close', node: box('ico', [line('ico-line--v', 'ico-rotate-45'), line('ico-line--h', 'ico-rotate-45')]) },
    { label: 'chevron', node: box('ico-chevron') },
    { label: 'check', node: box('ico-check') },
    { label: 'search', node: box('ico', [box('ico-search-ring'), box('ico-search-handle')]) },
    { label: 'menu', node: box('ico-menu', [line('ico-line--full'), line('ico-line--full'), line('ico-line--full')]) }
  ];
}

function field(label, input, hint, hintClass = 'field-hint') {
  return box('field', [text('field-label', label), input, hint ? text(hintClass, hint) : null]);
}

function components() {
  return [
    {
      id: 'buttons', title: 'Buttons',
      content: [box('kit-panel', [
        box('kit-row', [
          h('button', 'btn', 'Primary', { type: 'button' }),
          h('button', ['btn', 'btn--secondary'], 'Secondary', { type: 'button' }),
          h('button', ['btn', 'btn--ghost'], 'Ghost', { type: 'button' }),
          h('button', ['btn', 'btn--disabled'], 'Disabled', { type: 'button' }),
          box(['btn-loading'], [box('spinner'), text('btn-loading-text', 'Loading')])
        ]),
        box('kit-row', [
          h('button', ['btn', 'btn--sm'], 'Small', { type: 'button' }),
          h('button', 'btn', 'Medium', { type: 'button' }),
          h('button', ['btn', 'btn--lg'], 'Large', { type: 'button' }),
          h('button', ['btn', 'btn--icon'], '+', { type: 'button' })
        ])
      ])]
    },
    {
      id: 'inputs', title: 'Inputs',
      content: [box(['kit-panel', 'kit-grid--3'], [
        field('Label', box('input', [text('input-placeholder', 'Placeholder text')]), 'Helper text goes here'),
        field('Error state', box(['input', 'input--error'], [text('input-value', 'invalid@')]), '— This field has an error', 'field-error'),
        field('Disabled', box(['input', 'input--disabled'], [text('input-placeholder', 'Can’t edit')])),
        field('Search', box(['input', 'input--icon'], [box('ico-sm', [box('ico-sm-ring'), box('ico-sm-handle')]), text('input-placeholder', 'Search…')])),
        box(['field', 'field--wide'], [text('field-label', 'Textarea'), box(['input', 'input--textarea'], [text('input-placeholder', 'Write a message…')])]),
        field('Select', box(['input', 'input--select'], [text('input-value', 'Option one'), box('ico-chevron')])),
        field('Slider — 40%', box('slider', [box('slider-fill'), box('slider-thumb')]))
      ])]
    },
    {
      id: 'selectors', title: 'Checkbox, Radio & Switch',
      content: [box(['kit-panel', 'kit-columns'], [
        box('kit-column', [
          text('kit-column-title', 'Checkbox'),
          box('choice', [box(['check', 'check--on'], [box('check-mark')]), text('choice-label', 'Checked option')]),
          box('choice', [box('check'), text('choice-label', 'Unchecked option')])
        ]),
        box('kit-column', [
          text('kit-column-title', 'Radio'),
          box('choice', [box(['radio', 'radio--on'], [box('radio-dot')]), text('choice-label', 'Option A')]),
          box('choice', [box('radio'), text('choice-label', 'Option B')])
        ]),
        box('kit-column', [
          text('kit-column-title', 'Switch'),
          box('choice', [box(['switch', 'switch--on'], [box('switch-knob')]), text('choice-label', 'On')]),
          box('choice', [box('switch', [box('switch-knob')]), text('choice-label', 'Off')])
        ])
      ])]
    },
    {
      id: 'badges', title: 'Badges & Tags',
      content: [box(['kit-panel', 'kit-row'], [
        text('badge', 'Default'),
        text(['badge', 'badge--outline'], 'Outline'),
        text(['badge', 'badge--neutral'], 'Neutral'),
        box(['badge', 'badge--active'], [box('badge-dot'), text('badge-text', 'Active')]),
        box(['badge', 'badge--neutral', 'badge--removable'], [text('badge-text', 'Removable'), text('badge-remove', '×')]),
        text('tag', 'Tag')
      ])]
    },
    {
      id: 'alerts', title: 'Alerts',
      content: [box('kit-stack', [
        ['Information', 'Something worth noting, no action required.', 'info', 'i'],
        ['Success', 'The action completed without issues.', 'success', '✓'],
        ['Warning', 'Double-check this before continuing.', 'warning', '!'],
        ['Error', 'This action could not be completed.', 'error', '×']
      ].map(([title, body, tone, mark]) => box(['alert', `alert--${tone}`], [
        text(['alert-icon', `alert-icon--${tone}`], mark),
        box('alert-content', [text(['alert-title', `alert-title--${tone}`], title), text(['alert-text', `alert-text--${tone}`], body)])
      ])))]
    },
    {
      id: 'cards', title: 'Cards',
      content: [box('kit-grid', [
        box('card', [box('card-media', [text('card-media-label', 'image placeholder')]), box('card-body', [text('card-title', 'Card title'), text('card-text', 'Short supporting description for this card content.')])]),
        box(['card', 'card--elevated'], [box('card-mark'), text('card-title', 'Elevated card'), text('card-text', 'Uses shadow instead of border for separation.'), h('button', ['btn', 'btn--sm'], 'Action', { type: 'button' })]),
        box(['card', 'card--inverse'], [text('card-eyebrow', 'FEATURED'), text(['card-title', 'card-title--inverse'], 'Inverse card'), text(['card-text', 'card-text--inverse'], 'High-contrast variant for emphasis moments.')])
      ])]
    },
    {
      id: 'navigation', title: 'Navigation',
      content: [box('kit-stack', [
        box('navbar', [
          text('navbar-brand', 'Brand'),
          box('navbar-links', [text('navbar-link', 'Products'), text('navbar-link', 'Docs'), text('navbar-link', 'Pricing')]),
          h('button', ['btn', 'btn--sm'], 'Sign in', { type: 'button' })
        ]),
        box('breadcrumbs', [text('crumb', 'Home'), text('crumb-sep', '/'), text('crumb', 'Settings'), text('crumb-sep', '/'), text(['crumb', 'crumb--current'], 'Profile')]),
        box('pagination', [
          text('page', '‹'), text(['page', 'page--current'], '1'), text('page', '2'), text('page', '3'), text('page-gap', '…'), text('page', '12'), text('page', '›')
        ])
      ])]
    },
    {
      id: 'tabs', title: 'Tabs & Accordion',
      content: [box(['kit-panel', 'kit-panel--plain'], [
        box('tabs', [
          box('tab-list', [text(['tab', 'tab--active'], 'Overview'), text('tab', 'Details'), text('tab', 'Activity')]),
          text('tab-panel', 'A general summary of this record, its status, and recent changes.')
        ]),
        box('accordion', [
          box(['accordion-item', 'accordion-item--open'], [
            box('accordion-head', [text('accordion-title', 'What is included in the free plan?'), box(['ico-chevron', 'ico-chevron--up'])]),
            text('accordion-body', 'All core components, tokens, and up to three projects.')
          ]),
          box('accordion-item', [box('accordion-head', [text('accordion-title', 'Can I export my components?'), box('ico-chevron')])])
        ])
      ])]
    },
    {
      id: 'table', title: 'Table',
      content: [box('table', [
        box('table-scroll', [
          box(['table-row', 'table-row--head'], ['Name', 'Status', 'Role', 'Updated'].map(value => text('table-head', value))),
          ...[
            ['Ada Lovelace', 'Active', 'Admin', '2h ago', ''],
            ['Grace Hopper', 'Invited', 'Editor', '1d ago', 'neutral'],
            ['Alan Turing', 'Disabled', 'Viewer', '3w ago', 'outline']
          ].map(([name, status, role, updated, badge], index) => box(index === 1 ? ['table-row', 'table-row--striped'] : 'table-row', [
            text('table-name', name),
            box('table-cell', [text(badge ? ['badge', 'badge--sm', `badge--${badge}`] : ['badge', 'badge--sm'], status)]),
            text('table-muted', role),
            text('table-muted', updated)
          ]))
        ])
      ])]
    },
    {
      id: 'avatar', title: 'Avatar',
      content: [box('kit-row', [
        text(['avatar', 'avatar--sm'], 'AL'), text('avatar', 'GH'), text(['avatar', 'avatar--lg'], 'AT'),
        box('avatar-group', [text(['avatar', 'avatar--stacked', 'avatar--tone-1'], 'A'), text(['avatar', 'avatar--stacked', 'avatar--overlap', 'avatar--tone-2'], 'B'), text(['avatar', 'avatar--stacked', 'avatar--overlap', 'avatar--tone-3'], '+4')])
      ])]
    },
    {
      id: 'feedback', title: 'Modal, Toast & Progress',
      content: [box('kit-grid--2', [
        box('modal', [
          text('modal-title', 'Delete project?'),
          text('modal-text', 'This action cannot be undone. All files and history will be permanently removed.'),
          box('modal-actions', [h('button', ['btn', 'btn--secondary', 'btn--sm'], 'Cancel', { type: 'button' }), h('button', ['btn', 'btn--sm'], 'Delete', { type: 'button' })])
        ]),
        box('kit-stack', [
          box('toast', [box('toast-icon', [box('check-mark')]), text('toast-text', 'Changes saved'), text('toast-action', 'Undo')]),
          box('progress-block', [box('progress-head', [text('progress-label', 'Uploading'), text('progress-value', '64%')]), box('progress', [box('progress-fill')])]),
          box('kit-row', [box('spinner'), text('progress-label', 'Loading…')])
        ])
      ])]
    }
  ].map(item => ({ ...item, id: item.id === 'navigation' ? 'nav' : item.id }));
}

function componentStyles(css, { sans, mono }) {
  const border = (width, color) => ({ 'border-width': width, 'border-style': 'solid', 'border-color': color });
  const pad = (y, x) => ({ 'padding-top': y, 'padding-right': x, 'padding-bottom': y, 'padding-left': x });

  css.rule('.type-display', { 'font-size': '48px', 'font-weight': '800', 'line-height': '1.1', 'letter-spacing': '-0.02em', color: C.g950 }, { 991: { 'font-size': '42px' }, 767: { 'font-size': '36px' }, 479: { 'font-size': '30px' } });
  css.rule('.type-h1', { 'font-size': '34px', 'font-weight': '700', 'line-height': '1.15', 'letter-spacing': '-0.015em', color: C.g950 }, { 767: { 'font-size': '29px' }, 479: { 'font-size': '25px' } });
  css.rule('.type-h2', { 'font-size': '26px', 'font-weight': '700', 'line-height': '1.2', 'letter-spacing': '-0.01em', color: C.g950 }, { 767: { 'font-size': '23px' }, 479: { 'font-size': '21px' } });
  css.rule('.type-h3', { 'font-size': '20px', 'font-weight': '600', 'line-height': '1.3', color: C.g950 });
  css.rule('.type-body-l', { 'font-size': '17px', 'font-weight': '400', 'line-height': '1.6', color: C.g800 });
  css.rule('.type-body-m', { 'font-size': '15px', 'font-weight': '400', 'line-height': '1.6', color: C.g800 });
  css.rule('.type-caption', { 'font-size': '13px', 'font-weight': '500', 'line-height': '1.4', color: C.g500 });
  css.rule('.type-code', { 'font-family': mono, 'font-size': '14px', 'line-height': '1.5', color: C.g800 });

  css.rule('.ico', { position: 'relative', width: '20px', height: '20px' });
  css.rule('.ico-line', { position: 'absolute', 'background-color': C.g900 });
  css.rule('.ico-line--v', { left: '9px', top: '2px', width: '2px', height: '16px' });
  css.rule('.ico-line--h', { left: '2px', top: '9px', width: '16px', height: '2px' });
  css.rule('.ico-line--full', { position: 'static', width: '18px', height: '2px' });
  css.rule('.ico-rotate-45', { transform: 'rotate(45deg)' });
  css.rule('.ico-chevron', { width: '10px', height: '10px', 'margin-top': '-4px', ...border('0px', C.g900), 'border-bottom-width': '2px', 'border-left-width': '2px', transform: 'rotate(-45deg)' });
  css.rule('.ico-chevron--up', { 'margin-top': '4px', transform: 'rotate(135deg)' });
  css.rule('.ico-check', { width: '16px', height: '9px', 'margin-top': '-4px', ...border('0px', C.g900), 'border-bottom-width': '2px', 'border-left-width': '2px', transform: 'rotate(-45deg)' });
  css.rule('.ico-search-ring', { position: 'absolute', left: '2px', top: '2px', width: '12px', height: '12px', ...border('2px', C.g900), 'border-radius': '50%' });
  css.rule('.ico-search-handle', { position: 'absolute', left: '12px', top: '14px', width: '7px', height: '2px', 'background-color': C.g900, transform: 'rotate(45deg)' });
  // Small search glyph inside inputs: 13px, gray-500 strokes, as in the reference.
  css.rule('.ico-sm', { position: 'relative', 'flex-shrink': '0', width: '13px', height: '13px' });
  css.rule('.ico-sm-ring', { 'box-sizing': 'border-box', position: 'absolute', left: '0px', top: '0px', width: '9px', height: '9px', ...border('1.5px', C.g500), 'border-radius': '50%' });
  css.rule('.ico-sm-handle', { position: 'absolute', left: '8px', top: '8px', width: '5px', height: '1.5px', 'background-color': C.g500, transform: 'rotate(45deg)' });
  css.rule('.ico-menu', { display: 'flex', 'flex-direction': 'column', 'justify-content': 'space-between', width: '18px', height: '14px' });

  css.rule('.btn', { 'box-sizing': 'border-box', display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', 'column-gap': '8px', ...pad('11px', '20px'), ...border('1px', C.g950), 'border-radius': '6px', 'background-color': C.g950, color: C.white, 'font-family': sans, 'font-size': '14px', 'font-weight': '600', 'line-height': '1.2', cursor: 'pointer' });
  css.rule('.btn--secondary', { 'border-color': C.g300, 'background-color': C.white, color: C.g950 });
  css.rule('.btn--ghost', { 'border-color': 'transparent', 'background-color': 'transparent', color: C.g700 });
  css.rule('.btn--disabled', { 'border-color': C.g200, 'background-color': C.g200, color: C.g400, cursor: 'not-allowed' });
  css.rule('.btn--sm', { ...pad('7px', '14px'), 'font-size': '13px' });
  css.rule('.btn--lg', { ...pad('15px', '26px'), 'border-radius': '10px', 'font-size': '15px' });
  css.rule('.btn--icon', { 'box-sizing': 'border-box', width: '40px', height: '40px', ...pad('0px', '0px'), 'border-radius': '999px', 'font-size': '18px' });
  css.rule('.btn-loading', { 'box-sizing': 'border-box', display: 'inline-flex', 'align-items': 'center', 'column-gap': '8px', ...pad('11px', '18px'), 'border-radius': '6px', 'background-color': C.g950 });
  css.rule('.btn-loading-text', { color: C.white, 'font-size': '14px', 'font-weight': '600', 'line-height': '1.2' });
  css.rule('.spinner', { 'box-sizing': 'border-box', width: '14px', height: '14px', ...border('2px', C.g500), 'border-top-color': C.white, 'border-radius': '50%' });

  css.rule('.field', { display: 'flex', 'flex-direction': 'column', 'row-gap': '6px', 'min-width': '0px' });
  css.rule('.field--wide', { 'grid-column': '1 / -1' });
  css.rule('.field-label', { 'font-size': '13px', 'font-weight': '600', color: C.g800 });
  css.rule('.field-hint', { 'font-size': '12px', color: C.g500 });
  css.rule('.field-error', { 'font-size': '12px', 'font-weight': '600', color: C.g700 });
  css.rule('.input', { 'box-sizing': 'border-box', display: 'flex', 'align-items': 'center', 'column-gap': '8px', ...pad('11px', '14px'), ...border('1px', C.g300), 'border-radius': '6px', 'background-color': C.white });
  css.rule('.input--error', { 'border-width': '1.5px', 'border-color': C.g950 });
  css.rule('.input--disabled', { 'border-color': C.g200, 'background-color': C.g100 });
  css.rule('.input--select', { 'justify-content': 'space-between' });
  css.rule('.input--textarea', { 'align-items': 'flex-start', 'min-height': '96px' });
  css.rule('.input-placeholder', { 'font-size': '14px', 'line-height': '1.4', color: C.g400 });
  css.rule('.input-value', { 'font-size': '14px', 'line-height': '1.4', color: C.g950 });
  css.rule('.slider', { position: 'relative', height: '4px', 'margin-top': '12px', 'margin-bottom': '12px', 'border-radius': '999px', 'background-color': C.g200 });
  css.rule('.slider-fill', { width: '40%', height: '4px', 'border-radius': '999px', 'background-color': C.g950 });
  css.rule('.slider-thumb', { 'box-sizing': 'border-box', position: 'absolute', top: '-6px', left: '40%', width: '16px', height: '16px', 'margin-left': '-8px', ...border('2px', C.g950), 'border-radius': '50%', 'background-color': C.white });

  css.rule('.choice', { display: 'flex', 'align-items': 'center', 'column-gap': '10px' });
  css.rule('.choice-label', { 'font-size': '14px', color: C.g950 });
  css.rule('.check', { 'box-sizing': 'border-box', display: 'flex', 'align-items': 'center', 'justify-content': 'center', width: '18px', height: '18px', ...border('1.5px', C.g300), 'border-radius': '4px', 'background-color': C.white });
  css.rule('.check--on', { 'border-color': C.g950, 'background-color': C.g950 });
  css.rule('.check-mark', { width: '9px', height: '5px', 'margin-top': '-2px', ...border('0px', C.white), 'border-bottom-width': '2px', 'border-left-width': '2px', transform: 'rotate(-45deg)' });
  css.rule('.radio', { 'box-sizing': 'border-box', display: 'flex', 'align-items': 'center', 'justify-content': 'center', width: '18px', height: '18px', ...border('1.5px', C.g300), 'border-radius': '50%' });
  css.rule('.radio--on', { 'border-color': C.g950 });
  css.rule('.radio-dot', { width: '8px', height: '8px', 'border-radius': '50%', 'background-color': C.g950 });
  css.rule('.switch', { 'box-sizing': 'border-box', display: 'flex', 'align-items': 'center', 'justify-content': 'flex-start', width: '40px', height: '24px', ...pad('3px', '3px'), 'border-radius': '999px', 'background-color': C.g300 });
  css.rule('.switch--on', { 'justify-content': 'flex-end', 'background-color': C.g950 });
  css.rule('.switch-knob', { width: '18px', height: '18px', 'border-radius': '50%', 'background-color': C.white, 'box-shadow': '0 1px 2px rgba(0, 0, 0, 0.06)' });

  css.rule('.badge', { display: 'inline-flex', 'align-items': 'center', 'column-gap': '6px', ...pad('4px', '10px'), ...border('1px', C.g950), 'border-radius': '999px', 'background-color': C.g950, color: C.white, 'font-size': '12px', 'font-weight': '600', 'line-height': '1.4' });
  css.rule('.badge--outline', { 'border-color': C.g300, 'background-color': C.white, color: C.g950 });
  css.rule('.badge--neutral', { 'border-color': C.g100, 'background-color': C.g100, color: C.g600 });
  css.rule('.badge--active', { 'border-color': C.g950, 'background-color': C.white, color: C.g950 });
  css.rule('.badge--removable', { 'padding-left': '12px' });
  css.rule('.badge--sm', { ...pad('3px', '9px') });
  css.rule('.badge-dot', { width: '6px', height: '6px', 'border-radius': '50%', 'background-color': C.g950 });
  css.rule('.badge-text', { 'font-size': '12px', 'font-weight': '700', 'line-height': '1.4' });
  css.rule('.badge-remove', { 'font-size': '13px', 'font-weight': '700', 'line-height': '1', color: C.g700 });
  css.rule('.tag', { ...pad('3px', '9px'), ...border('1px', C.g950), 'border-radius': '4px', color: C.g950, 'font-size': '11px', 'font-weight': '700', 'line-height': '1.4', 'letter-spacing': '0.04em', 'text-transform': 'uppercase' });

  css.rule('.alert', { display: 'flex', 'align-items': 'flex-start', 'column-gap': '12px', ...pad('14px', '16px'), ...border('1px', C.g200), 'border-radius': '10px', 'background-color': C.white });
  css.rule('.alert--success', { 'border-color': C.g950, 'background-color': C.g950 });
  css.rule('.alert--warning', { 'border-width': '1.5px', 'border-color': C.g950, 'background-color': C.g50 });
  css.rule('.alert--error', { 'border-width': '2px', 'border-color': C.g950 });
  css.rule('.alert-icon', { display: 'flex', 'align-items': 'center', 'justify-content': 'center', width: '20px', height: '20px', 'flex-shrink': '0', ...border('1.5px', C.g500), 'border-radius': '50%', color: C.g500, 'font-size': '12px', 'font-weight': '700', 'line-height': '1' });
  css.rule('.alert-icon--success', { 'border-color': C.white, 'background-color': C.white, color: C.g950 });
  css.rule('.alert-icon--warning', { 'border-color': C.g950, color: C.g950, 'font-weight': '800' });
  css.rule('.alert-icon--error', { 'border-color': C.g950, 'background-color': C.g950, color: C.white, 'font-weight': '800' });
  css.rule('.alert-content', { display: 'flex', 'flex-direction': 'column', 'row-gap': '2px' });
  css.rule('.alert-title', { 'font-size': '14px', 'font-weight': '600', 'line-height': '1.4', color: C.g950 });
  css.rule('.alert-title--success', { color: C.white });
  css.rule('.alert-title--warning', { 'font-weight': '700' });
  css.rule('.alert-title--error', { 'font-weight': '700' });
  css.rule('.alert-text', { 'font-size': '13px', 'line-height': '1.5', color: C.g600 });
  css.rule('.alert-text--success', { color: C.g300 });
  css.rule('.alert-text--warning', { color: C.g700 });
  css.rule('.alert-text--error', { color: C.g700 });

  css.rule('.card', { display: 'flex', 'flex-direction': 'column', overflow: 'hidden', ...border('1px', C.g150), 'border-radius': '14px', 'background-color': C.white });
  css.rule('.card--elevated', { 'row-gap': '10px', ...pad('20px', '20px'), 'box-shadow': '0 4px 12px rgba(0, 0, 0, 0.08)', 'align-items': 'flex-start' });
  css.rule('.card--inverse', { 'row-gap': '10px', ...pad('20px', '20px'), 'border-color': C.g950, 'background-color': C.g950 });
  css.rule('.card-media', { display: 'flex', 'align-items': 'center', 'justify-content': 'center', height: '120px', 'background-color': C.g100 });
  css.rule('.card-media-label', { 'font-family': mono, 'font-size': '11px', color: C.g500 });
  css.rule('.card-body', { display: 'flex', 'flex-direction': 'column', 'row-gap': '4px', ...pad('16px', '16px') });
  css.rule('.card-mark', { width: '36px', height: '36px', 'border-radius': '6px', 'background-color': C.g950 });
  css.rule('.card-eyebrow', { 'font-family': mono, 'font-size': '12px', color: C.g400 });
  css.rule('.card-title', { 'font-size': '15px', 'font-weight': '700', 'line-height': '1.4', color: C.g950 });
  css.rule('.card-title--inverse', { color: C.white });
  css.rule('.card-text', { 'font-size': '13px', 'line-height': '1.5', color: C.g600 });
  css.rule('.card-text--inverse', { color: C.g300 });

  css.rule('.navbar', { display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', 'justify-content': 'space-between', 'column-gap': '24px', 'row-gap': '12px', ...pad('14px', '20px'), ...border('1px', C.g150), 'border-radius': '10px', 'background-color': C.white }, { 479: { 'padding-left': '14px', 'padding-right': '14px' } });
  css.rule('.navbar-brand', { 'font-size': '15px', 'font-weight': '800' });
  css.rule('.navbar-links', { display: 'flex', 'flex-wrap': 'wrap', 'column-gap': '24px', 'row-gap': '8px' }, { 479: { 'column-gap': '16px' } });
  css.rule('.navbar-link', { 'font-size': '14px', color: C.g600 });
  css.rule('.breadcrumbs', { display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', 'column-gap': '8px', 'row-gap': '8px' });
  css.rule('.crumb', { 'font-size': '13px', color: C.g500 });
  css.rule('.crumb--current', { color: C.g950, 'font-weight': '600' });
  css.rule('.crumb-sep', { 'font-size': '13px', color: C.g300 });
  css.rule('.pagination', { display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', 'column-gap': '6px', 'row-gap': '6px' });
  css.rule('.page', { 'box-sizing': 'border-box', display: 'flex', 'align-items': 'center', 'justify-content': 'center', width: '32px', height: '32px', ...border('1px', C.g200), 'border-radius': '6px', 'background-color': C.white, 'font-size': '13px', color: C.g950 });
  css.rule('.page--current', { 'border-color': C.g950, 'background-color': C.g950, color: C.white, 'font-weight': '700' });
  css.rule('.page-gap', { 'padding-left': '4px', 'padding-right': '4px', color: C.g400 });

  css.rule('.tabs', { display: 'flex', 'flex-direction': 'column', 'row-gap': '20px' });
  css.rule('.tab-list', { display: 'flex', 'column-gap': '24px', 'overflow-x': 'auto', 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': C.g150 });
  css.rule('.tab', { 'padding-top': '10px', 'padding-right': '4px', 'padding-bottom': '10px', 'padding-left': '4px', 'border-bottom-width': '2px', 'border-bottom-style': 'solid', 'border-bottom-color': C.white, 'font-size': '14px', 'font-weight': '600', color: C.g500, 'white-space': 'nowrap' });
  css.rule('.tab--active', { 'border-bottom-color': C.g950, color: C.g950 });
  css.rule('.tab-panel', { 'font-size': '14px', 'line-height': '1.6', color: C.g700 });
  css.rule('.accordion', { display: 'flex', 'flex-direction': 'column', 'border-top-width': '1px', 'border-top-style': 'solid', 'border-top-color': C.g150 });
  css.rule('.accordion-item', { 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': C.g150 });
  css.rule('.accordion-item--open', { 'padding-bottom': '16px' });
  css.rule('.accordion-head', { display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'column-gap': '12px', 'padding-top': '16px', 'padding-right': '4px', 'padding-bottom': '16px', 'padding-left': '4px' });
  css.rule('.accordion-title', { 'font-size': '14px', 'font-weight': '600', 'line-height': '1.4', color: C.g950 });
  css.rule('.accordion-body', { 'padding-right': '4px', 'padding-left': '4px', 'font-size': '13px', 'line-height': '1.6', color: C.g600 });

  css.rule('.table', { 'overflow-x': 'auto', ...border('1px', C.g150), 'border-radius': '10px' });
  css.rule('.table-scroll', { 'min-width': '560px' });
  css.rule('.table-row', { display: 'grid', 'grid-template-columns': '2fr 1fr 1fr 1fr', 'align-items': 'center', ...pad('14px', '20px'), 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': C.g100 });
  css.rule('.table-row--head', { 'padding-top': '12px', 'padding-bottom': '12px', 'border-bottom-color': C.g150, 'background-color': C.g50 });
  css.rule('.table-row--striped', { 'background-color': C.g50 });
  css.rule('.table-head', { 'font-size': '12px', 'font-weight': '700', 'letter-spacing': '0.04em', 'text-transform': 'uppercase', color: C.g500 });
  css.rule('.table-name', { 'font-size': '14px', 'font-weight': '600', color: C.g950 });
  css.rule('.table-cell', { display: 'flex' });
  css.rule('.table-muted', { 'font-size': '14px', color: C.g600 });

  css.rule('.avatar', { display: 'flex', 'align-items': 'center', 'justify-content': 'center', width: '40px', height: '40px', 'border-radius': '50%', 'background-color': C.g900, color: C.white, 'font-size': '14px', 'font-weight': '700' });
  css.rule('.avatar--sm', { width: '28px', height: '28px', 'font-size': '11px' });
  css.rule('.avatar--lg', { width: '56px', height: '56px', 'font-size': '18px' });
  css.rule('.avatar-group', { display: 'flex' });
  css.rule('.avatar--stacked', { 'box-sizing': 'border-box', width: '36px', height: '36px', ...border('2px', C.white), 'font-size': '12px' });
  css.rule('.avatar--overlap', { 'margin-left': '-10px' });
  css.rule('.avatar--tone-1', { 'background-color': C.g800 });
  css.rule('.avatar--tone-2', { 'background-color': C.g600 });
  css.rule('.avatar--tone-3', { 'background-color': C.g400 });

  css.rule('.modal', { display: 'flex', 'flex-direction': 'column', ...pad('28px', '28px'), 'border-radius': '14px', 'background-color': C.white, 'box-shadow': '0 24px 64px rgba(0, 0, 0, 0.16)' }, { 479: { 'padding-top': '20px', 'padding-right': '20px', 'padding-bottom': '20px', 'padding-left': '20px' } });
  css.rule('.modal-title', { 'margin-bottom': '8px', 'font-size': '17px', 'font-weight': '700', color: C.g950 });
  css.rule('.modal-text', { 'margin-bottom': '24px', 'font-size': '14px', 'line-height': '1.5', color: C.g600 });
  css.rule('.modal-actions', { display: 'flex', 'flex-wrap': 'wrap', 'justify-content': 'flex-end', 'column-gap': '10px', 'row-gap': '10px' });
  css.rule('.toast', { display: 'flex', 'align-items': 'center', 'column-gap': '12px', ...pad('12px', '16px'), 'border-radius': '10px', 'background-color': C.g950, 'box-shadow': '0 12px 32px rgba(0, 0, 0, 0.12)' });
  css.rule('.toast-icon', { display: 'flex', 'align-items': 'center', 'justify-content': 'center', width: '20px', height: '20px', 'flex-shrink': '0', 'border-radius': '50%', 'background-color': C.g700 });
  css.rule('.toast-text', { 'flex-grow': '1', 'font-size': '14px', 'font-weight': '500', color: C.white });
  css.rule('.toast-action', { 'font-size': '13px', 'font-weight': '600', color: C.g300 });
  css.rule('.progress-block', { display: 'flex', 'flex-direction': 'column', 'row-gap': '8px' });
  css.rule('.progress-head', { display: 'flex', 'justify-content': 'space-between' });
  css.rule('.progress-label', { 'font-size': '13px', 'font-weight': '600', color: C.g800 });
  css.rule('.progress-value', { 'font-family': mono, 'font-size': '12px', color: C.g500 });
  css.rule('.progress', { height: '6px', overflow: 'hidden', 'border-radius': '999px', 'background-color': C.g150 });
  css.rule('.progress-fill', { width: '64%', height: '6px', 'border-radius': '999px', 'background-color': C.g950 });
}

const DEFAULT_KIT = {
  projectName: 'Monochrome',
  fonts: { primary: 'Inter Tight' },
  colors: [
    {
      title: 'Grayscale ramp', layout: 'ramp',
      items: [['white', C.white], ['50', C.g50], ['100', C.g100], ['150', C.g150], ['200', C.g200], ['300', C.g300], ['400', C.g400], ['500', C.g500], ['600', C.g600], ['700', C.g700], ['800', C.g800], ['900', C.g900]]
        .map(([name, value]) => ({ name, value }))
    },
    {
      title: 'Semantic tokens', layout: 'tokens',
      items: [
        { name: 'bg', value: C.white, note: 'white · #ffffff' },
        { name: 'surface', value: C.g50, note: 'gray-50 · #fafafa' },
        { name: 'border', value: C.g200, note: 'gray-200 · #dedede' },
        { name: 'text-primary', value: C.g950, note: 'gray-950 · #020202' }
      ]
    }
  ],
  typography: [
    { className: 'type-display', spec: '48 / 800 / −2%' },
    { className: 'type-h1', spec: '34 / 700 / −1.5%' },
    { className: 'type-h2', spec: '26 / 700 / −1%' },
    { className: 'type-h3', spec: '20 / 600 / 0' },
    { className: 'type-body-l', sample: 'The quick brown fox jumps over the lazy dog', spec: '17 / 400 / 1.6' },
    { className: 'type-body-m', sample: 'The quick brown fox jumps over the lazy dog', spec: '15 / 400 / 1.6' },
    { className: 'type-caption', sample: 'The quick brown fox jumps over the lazy dog', spec: '13 / 500 / 1.4' },
    { className: 'type-code', sample: 'const x = 42;', spec: '14 / mono' }
  ],
  spacing: [4, 8, 12, 16, 24, 32, 48, 64, 96],
  radius: [{ label: '0', value: '0px' }, { label: '6', value: '6px' }, { label: '10', value: '10px' }, { label: '14', value: '14px' }, { label: '20', value: '20px' }, { label: 'full', value: '999px' }],
  shadows: [
    { label: 'sm', value: '0 1px 2px rgba(0, 0, 0, 0.06)' },
    { label: 'md', value: '0 4px 12px rgba(0, 0, 0, 0.08)' },
    { label: 'lg', value: '0 12px 32px rgba(0, 0, 0, 0.12)' },
    { label: 'xl', value: '0 24px 64px rgba(0, 0, 0, 0.16)' }
  ],
  get icons() { return icons(); },
  get components() { return components(); },
  componentStyles
};

module.exports = { DEFAULT_KIT };
