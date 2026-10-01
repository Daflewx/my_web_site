import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMedia } from '../js/media.js';

test('Accepts supported photo and video categories', () => {
  assert.equal(validateMedia({ type: 'image/webp', size: 1200 }, 'portraits'), 'image');
  assert.equal(validateMedia({ type: 'image/jpeg', size: 1200 }, 'reportage'), 'image');
  assert.equal(validateMedia({ type: 'video/mp4', size: 1200 }, 'video'), 'video');
});
test('Rejects oversized, empty, mismatched, and unsupported files', () => {
  const invalid = [
    [{ type: 'image/svg+xml', size: 20 }, 'portraits'],
    [{ type: 'image/jpeg', size: 0 }, 'portraits'],
    [{ type: 'image/jpeg', size: 11 * 1024 * 1024 }, 'portraits'],
    [{ type: 'video/mp4', size: 51 * 1024 * 1024 }, 'video'],
    [{ type: 'video/mp4', size: 20 }, 'portraits'],
    [{ type: 'image/webp', size: 20 }, 'video'],
    [{ type: 'image/webp', size: 20 }, 'unknown'],
    [{ type: 'image/webp', size: 20 }, '__proto__'],
  ];
  invalid.forEach(([file, category]) => assert.throws(() => validateMedia(file, category)));
});
