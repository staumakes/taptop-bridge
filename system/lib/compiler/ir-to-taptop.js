const { buildTokenTable } = require('../tokens');
const { extractRulesForSelectors } = require('../css-rules');
const { mergeCollectedRules } = require('../css-collect');
const { buildRuleSetsForSelector, TAPTOP_MEDIA_MAP } = require('../rule-sets');
const { createTagBuilder } = require('../tag-builder');
const { buildButton, buildLink, buildLinkWrapper, buildImage, mirrorButtonFillsToDesignCollection } = require('../component-builders');
const { validateHtmlCompilerManifest, validateHtmlIr } = require('../html-ir-contract');
const { validateExport } = require('../validate-export');
const { finalizeClipboardData } = require('../runtime-shape');
const behaviorAdapterRegistry = require('../../contracts/behaviors/adapter-registry.json');
const { assessBehaviorCoverage } = require('../behavior-adapter-registry');
const { buildEmbedBehaviorPackage } = require('../behavior-package');
const { buildAccordionEmbedCode } = require('../accordion-embed-code');
const { buildTabsEmbedCode } = require('../tabs-embed-code');
const { buildMenuEmbedCode } = require('../menu-embed-code');
const { buildSliderEmbedCode } = require('../slider-embed-code');
const { buildVideoEmbedCode } = require('../video-embed-code');
const { buildRevealEmbedCode } = require('../reveal-embed-code');
const EMBED_BUILDERS = { 'taptop/embed-accordion-v1': buildAccordionEmbedCode, 'taptop/embed-tabs-v1': buildTabsEmbedCode, 'taptop/embed-menu-v1': buildMenuEmbedCode,
  'taptop/embed-slider-v1': buildSliderEmbedCode, 'taptop/embed-video-v1': buildVideoEmbedCode,
  'taptop/embed-reveal-v1': buildRevealEmbedCode };
const embedFixture = require('../../contracts/behaviors/fixtures/tt-embed-v1.json');

const CHANNEL_COLLECTION = {
  main: 'mainSelectorCollection', design: 'designSelectorCollection',
  cm: 'cmSelectorCollection', animation: 'animationSelectorCollection'
};

function compilerError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function compileIrToTaptop({ ir, manifest, stylesheetTexts, assetKeys = {} }) {
  const manifestErrors = validateHtmlCompilerManifest(manifest);
  if (manifestErrors.length) throw compilerError('INVALID_HTML_IR_MANIFEST', manifestErrors.join('; '));
  const irErrors = validateHtmlIr(ir);
  if (irErrors.length) throw compilerError('INVALID_HTML_IR', irErrors.join('; '));
  if (ir.componentKey !== manifest.componentKey) throw compilerError('COMPONENT_KEY_MISMATCH', `${ir.componentKey} != ${manifest.componentKey}`);
  const behaviorCoverage = assessBehaviorCoverage(ir.behaviors || {}, behaviorAdapterRegistry);
  if (behaviorCoverage.blockers.length) {
    const blocker = behaviorCoverage.blockers[0];
    const missing = blocker.missingEvidence.length ? `; missing evidence: ${blocker.missingEvidence.join(', ')}` : '';
    throw compilerError(blocker.code, `${blocker.adapter} (${blocker.behaviorKey}): ${blocker.reason}${missing}`);
  }
  const behaviorPackages = behaviorCoverage.ready.map(({ behavior }) => {
    const builder = EMBED_BUILDERS[behavior.adapter];
    if (!builder) {
      throw compilerError('BEHAVIOR_ADAPTER_NOT_CONNECTED', `${behavior.adapter} (${behavior.key}) is ready in the registry but is not connected to the IR compiler`);
    }
    let embedCode;
    try { embedCode = builder(behavior.config); }
    catch (error) { throw compilerError(error?.message || 'BEHAVIOR_CONFIG_INVALID', `${behavior.key} needs a valid class contract`); }
    return buildEmbedBehaviorPackage({
      fixture: embedFixture,
      key: behavior.key,
      adapter: behavior.adapter,
      name: `behavior-${behavior.key.replace(/[^A-Za-z0-9_-]+/g, '-')}`,
      embedCode
    });
  });

  const sourceClasses = new Set(Object.values(ir.nodes).flatMap((node) => node.classes));
  const typographyCompositions = manifest.typographyCompositions || [];
  const compositionBySourceClass = new Map();
  for (const composition of typographyCompositions) {
    if (!sourceClasses.has(composition.sourceClass)) {
      throw compilerError('UNKNOWN_TYPOGRAPHY_SOURCE_CLASS', `typography composition targets class ${JSON.stringify(composition.sourceClass)} absent from IR`);
    }

    compositionBySourceClass.set(composition.sourceClass, composition);
  }
  function composedClasses(classNames) {
    const result = [];
    for (const className of classNames) {
      const tokenClass = compositionBySourceClass.get(className)?.tokenClass;
      if (tokenClass && !result.includes(tokenClass)) result.push(tokenClass);
      if (!result.includes(className)) result.push(className);
    }
    return result;
  }
  const automaticMappings = [...new Set([...sourceClasses, ...typographyCompositions.map(item => item.tokenClass)])].sort().map((className) => ({
    sourceSelector: `.${className}`, targetClass: className, channel: 'main', pseudoSuffix: ''
  }));
  const explicitMappings = (manifest.selectorMappings || []).map((mapping) => ({ pseudoSuffix: '', ...mapping }));
  for (const mapping of explicitMappings) {
    if (!sourceClasses.has(mapping.targetClass)) {
      throw compilerError('UNKNOWN_TARGET_CLASS', `selector mapping targets class ${JSON.stringify(mapping.targetClass)} absent from IR`);
    }
  }
  const mappings = [...automaticMappings, ...explicitMappings];
  const wantedSelectors = [...new Set(mappings.map((mapping) => mapping.sourceSelector))];
  const extractedSources = manifest.stylesheets.map((stylesheetPath) => {
    const cssText = stylesheetTexts?.[stylesheetPath];
    if (typeof cssText !== 'string') throw compilerError('MISSING_STYLESHEET', `missing stylesheet ${JSON.stringify(stylesheetPath)}`);
    return extractRulesForSelectors(cssText, wantedSelectors);
  });
  const extracted = mergeCollectedRules(...extractedSources);

  for (const [selector, byMedia] of extracted) {
    for (const media of byMedia.keys()) {
      if (media === 'screen') continue;
      const target = manifest.breakpointMap[media];
      if (!target) throw compilerError('UNMAPPED_BREAKPOINT', `${media} on ${selector} is not declared in manifest.breakpointMap`);
      if (TAPTOP_MEDIA_MAP[media] !== target) {
        throw compilerError('UNSUPPORTED_BREAKPOINT_MAPPING', `${media} -> ${target} is not implemented by the current typed-rule writer`);
      }
    }
  }

  // A line-height that is not px is written as a custom rule (css-rules.js toTaptopRule):
  // the native control would store 0px (live 2026-10-07), the custom rule keeps it (2026-10-12).

  const { makeTag, tags, mainClassNameCollection } = createTagBuilder();
  const collections = {
    mainSelectorCollection: { map: {} }, designSelectorCollection: { map: {} },
    cmSelectorCollection: { map: {} }, animationSelectorCollection: { map: {} }
  };
  const tokenTable = buildTokenTable('');
  for (const mapping of mappings) {
    const channelName = CHANNEL_COLLECTION[mapping.channel];
    const ruleSets = buildRuleSetsForSelector(mapping.sourceSelector, tokenTable, extracted);
    const omittedProperties = new Set(compositionBySourceClass.get(mapping.targetClass)?.omitProperties || []);
    for (const rules of Object.values(ruleSets)) for (const property of omittedProperties) {
      delete rules[property];
      if (property === 'margin' || property === 'padding') {
        for (const side of ['top', 'right', 'bottom', 'left']) delete rules[`${property}-${side}`];
      }
    }
    const selectorText = `.${mapping.targetClass}${mapping.pseudoSuffix || ''}`;
    for (const [sourceMedia, rules] of Object.entries(ruleSets)) {
      if (!Object.keys(rules).length) continue;
      const media = TAPTOP_MEDIA_MAP[sourceMedia];
      const key = `${media}/${selectorText}`;
      const collection = collections[channelName];
      collection.map[key] = collection.map[key]
        ? { ...collection.map[key], rules: { ...collection.map[key].rules, ...rules } }
        : { media, selectorText, rules };
    }
  }

  for (const { tokenClass } of typographyCompositions) {
    if (!collections.mainSelectorCollection.map[`screen/.${tokenClass}`]) {
      throw compilerError('MISSING_PROJECT_TYPOGRAPHY', `No base CSS rules supplied for .${tokenClass}`);
    }
  }

  function screenValue(classNames, property) {
    for (let index = classNames.length - 1; index >= 0; index -= 1) {
      const value = collections.mainSelectorCollection.map[`screen/.${classNames[index]}`]?.rules?.[property]?.value;
      if (value !== undefined) return value;
    }
    return undefined;
  }

  const nodeBindings = {};
  function buildNode(key, parent) {
    const node = ir.nodes[key];
    const bemClasses = composedClasses(node.classes);
    let targetId;
    if (node.kind === 'container') {
      targetId = makeTag({ widgetName: 'div', type: 'div', className: 'div', bemClasses, name: node.classes[node.classes.length - 1], parent });
    } else if (node.kind === 'text') {
      targetId = makeTag({ widgetName: 'text', type: 'text', className: 'text', bemClasses, name: node.classes[node.classes.length - 1], parent, text: node.text || '' });
    } else if (node.kind === 'button') {
      targetId = buildButton(makeTag, { parent, bemClasses, text: node.text || '', href: '' });
    } else if (node.kind === 'link') {
      targetId = buildLink(makeTag, { parent, bemClasses, text: node.text || '', href: node.attributes.href || '' });
    } else if (node.kind === 'link-block') {
      targetId = buildLinkWrapper(makeTag, { parent, bemClasses, href: node.attributes.href || '' });
    } else if (node.kind === 'image') {
      const assetKey = assetKeys[node.asset.sourcePath];
      if (!assetKey) throw compilerError('MISSING_PACKAGE_ASSET', `No package asset mapped for ${node.asset.sourcePath}`);
      targetId = buildImage(makeTag, {
        parent, bemClasses, assetKey, alt: node.asset.alt,
        objectFit: screenValue(bemClasses, 'object-fit') || 'cover',
        maxWidth: String(node.asset.intrinsicWidth), maxHeight: String(node.asset.intrinsicHeight)
      });
    } else if (node.kind === 'rich-text') {
      // Native copy of a Rich Text layer (2026-10-11): one tag, inner HTML kept verbatim.
      targetId = makeTag({ widgetName: 'tt_rich_text', type: 'tt_rich_text', className: 'tt-rich-text', bemClasses, name: node.classes[node.classes.length - 1], parent,
        extraData: { text: { type: 'RICH_TEXT', value: node.html } }, extra: { can: ['SELECT', 'SET_RICH_TEXT'], dataSource: 'from_parent' } });
    } else if (node.kind === 'inline-svg') {
      // Native copy of an SVG Icon layer (2026-10-11): a <span class="svg-icon"> holding the SVG markup.
      targetId = makeTag({ widgetName: 'tt_svg_icon', type: 'tt_svg_icon', tagName: 'span', alias: 'SVG Icon', className: 'svg-icon', bemClasses, name: node.classes[node.classes.length - 1], parent,
        extraData: { text: { type: 'HTML', value: node.html } }, extra: { can: ['SELECT', 'SET_ATTR_SRC_SVG'], dataSource: 'from_parent' } });
    } else {
      throw compilerError('UNSUPPORTED_IR_ADAPTER', `kind ${JSON.stringify(node.kind)} at ${node.source.domPath}`);
    }
    nodeBindings[key] = targetId;
    if (!['button', 'link', 'image', 'rich-text', 'inline-svg'].includes(node.kind)) {
      for (const childKey of node.children) buildNode(childKey, targetId);
    }
    return targetId;
  }

  const rootId = buildNode(ir.rootKey);
  const fillCollections = mirrorButtonFillsToDesignCollection(tags, mainClassNameCollection, collections.mainSelectorCollection);
  // Explicit design mappings and mandatory widget fill finalization share one
  // channel. A duplicate key is merged by property so neither source is lost.
  for (const [key, entry] of Object.entries(fillCollections.designSelectorCollection.map)) {
    const previous = collections.designSelectorCollection.map[key];
    collections.designSelectorCollection.map[key] = previous
      ? { ...previous, rules: { ...previous.rules, ...entry.rules } }
      : entry;
  }

  const clipboardData = finalizeClipboardData({
    action: 'copy', tagID: rootId,
    copiedLayout: {
      tree: { version: '3.1.0', root: rootId, tags }, mainClassNameCollection,
      designClassNameCollection: fillCollections.designClassNameCollection,
      ...collections
    }
  });
  const exportErrors = validateExport(clipboardData);
  if (exportErrors.length) throw compilerError('INVALID_TAPTOP_EXPORT', exportErrors.join('; '));
  return { clipboardData, nodeBindings, behaviorPackages };
}

module.exports = { compileIrToTaptop };
