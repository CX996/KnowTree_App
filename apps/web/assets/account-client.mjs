import { normalizeApiError } from './error-view.mjs';

async function request(path, options = {}) {
  try {
    return await window.KT.request(path, options);
  } catch (error) {
    throw normalizeApiError(error);
  }
}

export function getAccount() {
  return request('/me');
}

export function updateAccount(patch) {
  return request('/me', { method: 'PATCH', body: patch });
}

export async function changePassword(currentPassword, newPassword) {
  const result = await request('/me/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
  window.KT.clearToken();
  return result;
}

export async function logoutCurrent() {
  try {
    return await request('/me/logout', { method: 'POST', body: {} });
  } finally {
    window.KT.clearToken();
  }
}

export async function logoutAll(currentPassword) {
  const result = await request('/me/logout-all', {
    method: 'POST',
    body: { currentPassword },
  });
  window.KT.clearToken();
  return result;
}

export async function requestDeletion(input) {
  const result = await request('/me/deletion', { method: 'POST', body: input });
  window.KT.clearToken();
  return result;
}

export function cancelDeletion(currentPassword) {
  return request('/me/deletion', {
    method: 'DELETE',
    body: { currentPassword },
  });
}

export function validateInvitation(token) {
  return request('/auth/invite/validate', {
    method: 'POST',
    body: { token },
    timeoutMs: 30000,
  });
}

export async function registerWithInvitation(input) {
  const session = await request('/auth/invite/register', {
    method: 'POST',
    body: input,
    timeoutMs: 45000,
  });
  window.KT.setToken(session.accessToken, session.refreshToken);
  return session;
}

export function listInvitations() {
  return request('/owner/invites');
}

export function createInvitation(email) {
  return request('/owner/invites', {
    method: 'POST',
    body: { email },
  });
}

export function revokeInvitation(id) {
  return request('/owner/invites/' + encodeURIComponent(id), { method: 'DELETE' });
}

export function listErrorEvents(query = '') {
  return request('/owner/error-events' + query);
}

export function listCategories() {
  return request('/categories');
}

export function createCategory(input) {
  return request('/categories', { method: 'POST', body: input });
}

export function updateCategory(id, patch) {
  return request('/categories/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: patch,
  });
}

export function deleteCategory(id) {
  return request('/categories/' + encodeURIComponent(id), { method: 'DELETE' });
}

export function listTrash(query = '') {
  return request('/trash' + (query ? '?q=' + encodeURIComponent(query) : ''));
}

export function restoreTrash(id) {
  return request('/trash/' + encodeURIComponent(id) + '/restore', {
    method: 'POST',
    body: {},
  });
}

export function permanentlyDeleteTrash(id) {
  return request('/trash/' + encodeURIComponent(id), { method: 'DELETE' });
}
