'use strict';

const PALETTE = [
  { name: 'Navy', hex: '#1f3a68' },
  { name: 'White', hex: '#f4f4f1' },
  { name: 'Sky blue', hex: '#8fc1e8' },
  { name: 'Black', hex: '#1c1c1e' },
  { name: 'Grey', hex: '#9a9fa6' },
  { name: 'Olive', hex: '#6b7a46' },
  { name: 'Maroon', hex: '#7a2336' },
  { name: 'Pink', hex: '#ff8fb3' },
  { name: 'Lavender', hex: '#b9a6e0' },
  { name: 'Beige', hex: '#d9c3a0' }
];

const VALID_COLOR_NAMES = new Set(PALETTE.map(c => c.name));
const COLOR_MAP = new Map(PALETTE.map(c => [c.name, c.hex]));

function isValidColor(name) {
  return typeof name === 'string' && VALID_COLOR_NAMES.has(name);
}

function getColorHex(name) {
  return COLOR_MAP.get(name) || null;
}

module.exports = {
  PALETTE,
  VALID_COLOR_NAMES,
  isValidColor,
  getColorHex
};
