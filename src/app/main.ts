// Einstiegspunkt der App: rendert vorerst nur eine Platzhalterseite.
const root = document.getElementById('app');
if (root) {
  const h1 = document.createElement('h1');
  h1.textContent = 'ParKing – coming soon';
  root.append(h1);
}
