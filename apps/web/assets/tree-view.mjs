const CATEGORY_POSITIONS = [
  { x: 180, y: 68 },
  { x: 84, y: 148 },
  { x: 276, y: 148 },
  { x: 106, y: 272 },
  { x: 254, y: 272 },
];

const FOLIAGE = [
  { x: 180, y: 64, scale: 1.1, rotate: -4, tone: 'deep' },
  { x: 92, y: 126, scale: 0.92, rotate: -18, tone: 'mid' },
  { x: 270, y: 126, scale: 0.98, rotate: 15, tone: 'deep' },
  { x: 118, y: 231, scale: 0.76, rotate: -12, tone: 'light' },
  { x: 246, y: 234, scale: 0.8, rotate: 12, tone: 'mid' },
  { x: 182, y: 184, scale: 0.72, rotate: 3, tone: 'light' },
];

function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shortLabel(value) {
  const text = String(value || '');
  return text.length > 7 ? text.slice(0, 6) + '…' : text;
}

function foliageCluster(cluster) {
  const leaves = [
    [-15, 2, -18], [-5, -10, 6], [8, -7, 22], [16, 4, 14],
    [-10, 12, -8], [4, 13, 28], [21, -14, -4], [-24, -4, 10],
  ];
  return (
    '<g class="tree-foliage tree-foliage--' + cluster.tone + '" ' +
    'transform="translate(' + cluster.x + ' ' + cluster.y + ') rotate(' + cluster.rotate + ') scale(' + cluster.scale + ')">' +
      leaves.map(([x, y, rotate]) =>
        '<path d="M0 0C8-11 21-10 27 0C19 10 7 11 0 0Z" ' +
        'transform="translate(' + x + ' ' + y + ') rotate(' + rotate + ')"></path>'
      ).join('') +
    '</g>'
  );
}

function categoryTag(category, index) {
  const point = CATEGORY_POSITIONS[index];
  const count = Number(category.count) || 0;
  return (
    '<g class="tree-category" data-node="' + escapeXml(category.id) + '" tabindex="0" role="link" ' +
    'aria-label="' + escapeXml(category.name + '，' + count + ' 条') + '" ' +
    'transform="translate(' + point.x + ' ' + point.y + ')">' +
      '<rect class="tree-category__tag" x="-44" y="-14" width="88" height="28" rx="14"></rect>' +
      '<circle class="tree-category__dot" cx="-31" cy="0" r="7"></circle>' +
      '<text class="tree-category__count" x="-31" y="3.5" text-anchor="middle">' + count + '</text>' +
      '<text class="tree-category__label" x="-19" y="3.5">' + escapeXml(shortLabel(category.name)) + '</text>' +
    '</g>'
  );
}

export function renderKnowledgeTree(categories) {
  return (
    '<path class="tree-ground" d="M36 354C108 340 252 340 324 354"></path>' +
    '<path class="tree-trunk" d="M157 356C164 326 153 300 163 271C171 246 161 220 171 195C177 176 173 153 182 132C188 117 190 104 188 91L204 88C203 108 199 122 207 140C216 161 209 182 213 205C218 232 207 253 214 278C221 306 209 331 218 356Z"></path>' +
    '<path class="tree-bark" d="M174 337C181 312 177 287 182 263M191 246C197 221 190 198 194 177M185 155C190 137 189 119 192 103"></path>' +
    '<path class="tree-root" d="M162 340C132 343 105 351 73 360M171 346C145 352 122 360 102 370M208 340C239 343 268 351 298 360"></path>' +
    '<g class="tree-branches">' +
      '<path class="tree-branch tree-branch--thick" d="M187 213C163 205 140 190 122 172C108 159 99 152 88 147"></path>' +
      '<path class="tree-branch tree-branch--thick" d="M198 204C221 192 245 176 261 158C269 149 274 149 280 148"></path>' +
      '<path class="tree-branch" d="M207 260C181 259 151 264 128 277C119 282 112 286 107 291"></path>' +
      '<path class="tree-branch" d="M211 257C236 257 258 263 275 276C282 282 287 286 290 291"></path>' +
      '<path class="tree-branch tree-branch--upper" d="M191 158C189 140 185 118 183 94C182 82 181 75 181 69"></path>' +
      '<path class="tree-branch tree-branch--upper" d="M198 151C222 137 246 122 267 107"></path>' +
    '</g>' +
    '<g class="tree-canopy" aria-hidden="true">' +
      FOLIAGE.map(foliageCluster).join('') +
    '</g>' +
    categories.slice(0, 5).map(categoryTag).join('')
  );
}
