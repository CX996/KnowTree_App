export function nextSwitchState(ariaChecked) {
  const on = ariaChecked !== 'true';
  return { on, ariaChecked: String(on) };
}

export function petPreferenceUpdate(kind, on) {
  if (kind === 'motion') {
    return { key: 'knowtree.pet.motion.v1', value: on ? '1' : '0' };
  }
  if (kind === 'size') {
    return { key: 'knowtree.pet.size.v1', value: String(on || 'medium') };
  }
  throw new Error('Unsupported pet preference: ' + kind);
}

export function removeAuthenticatedChrome(root) {
  const removed = [];
  root.querySelectorAll('.app-rail, .pet-mount, [data-pet-mount]').forEach((node) => {
    removed.push(node);
    node.remove();
  });
  if (root.body && root.body.classList) root.body.classList.remove('has-app-shell');
  return removed;
}
