import { marked } from './vendor/marked.esm.js';
import DOMPurify from './vendor/purify.es.mjs';

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function renderMarkdown(markdown) {
  const source = String(markdown || '');
  if (!source.trim()) {
    return '<p class="t3">这条知识还没有正文。</p>';
  }

  const rendered = marked.parse(source);
  const clean = DOMPurify.sanitize(String(rendered), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['style'],
    ADD_ATTR: ['target', 'rel'],
  });

  const template = document.createElement('template');
  template.innerHTML = clean;
  template.content.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    const headingLevel = Number(heading.tagName.slice(1));
    const nextLevel = Math.min(headingLevel + 1, 6);
    if (nextLevel === headingLevel) return;
    const replacement = document.createElement(`h${nextLevel}`);
    for (const attribute of heading.attributes) {
      replacement.setAttribute(attribute.name, attribute.value);
    }
    while (heading.firstChild) replacement.appendChild(heading.firstChild);
    heading.replaceWith(replacement);
  });
  template.content.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return template.innerHTML;
}
