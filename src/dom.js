// Handles to the elements in index.html. Modules are deferred, so the page is already parsed here.

export const $ = (id) => document.getElementById(id);

export const canvas = $('game');
export const ctx = canvas.getContext('2d');

export const el = {
  level: $('level'), title: $('title'), gold: $('gold'), hint: $('hint'),
  stage: $('stage'), menu: $('menu'), levelGrid: $('levelGrid'),
  end: $('end'), endGold: $('endGold'), sound: $('sound'),
  dpad: $('dpad'), dpadToggle: $('dpadToggle'),
  moves: $('moves'), result: $('result'), resultTitle: $('resultTitle'), resultStars: $('resultStars'),
  resultInfo: $('resultInfo'), resultTip: $('resultTip'), resultNext: $('resultNext'), resultRetry: $('resultRetry'),
  restart: $('restart'), levelBtn: $('levelBtn'), menuClose: $('menuClose'), again: $('again'),
};

export const coarse = matchMedia('(pointer: coarse)').matches;   // touch screen

export const menuOpen = () => !el.menu.hidden;
