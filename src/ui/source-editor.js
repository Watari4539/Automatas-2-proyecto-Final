/** A fixed gutter; code scrolls horizontally without moving its line numbers. */
export function createSourceLineNumbers(input, numbers) {
  const body = input.closest('.editor-body');
  let lastCount = 0;
  function syncScroll() {
    numbers.style.transform = `translateY(${-input.scrollTop}px)`;
  }
  function update() {
    const count = input.value.split(/\r\n|\r|\n/).length;
    if (count !== lastCount) {
      numbers.textContent = Array.from({ length: count }, (_, index) => index + 1).join('\n');
      body.style.setProperty('--line-digits', Math.max(2, String(count).length));
      lastCount = count;
    }
    syncScroll();
  }
  input.addEventListener('input', update);
  input.addEventListener('scroll', syncScroll, { passive: true });
  const observer = new ResizeObserver(syncScroll);
  observer.observe(input);
  update();
  return {
    update,
    destroy() {
      input.removeEventListener('input', update);
      input.removeEventListener('scroll', syncScroll);
      observer.disconnect();
    },
  };
}
