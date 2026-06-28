import { nextTick, onMounted, watch } from 'vue';

function updateCursor(input, cursor) {
  if (!input || !cursor) return;

  const selectionStart = input.selectionStart;
  let displayText = input.value.substring(0, selectionStart);
  if (input.type === 'password') {
    displayText = '\u2022'.repeat(selectionStart);
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = getComputedStyle(input).font;
  const textWidth = ctx.measureText(displayText).width;

  const inputRect = input.getBoundingClientRect();
  const paddingLeft = parseFloat(getComputedStyle(input).paddingLeft);

  const cursorHeight = 24;
  const cursorTop = (inputRect.height - cursorHeight) / 2;

  cursor.style.left = `${paddingLeft + textWidth}px`;
  cursor.style.top = `${cursorTop}px`;
  cursor.style.height = `${cursorHeight}px`;
}

function setupCursorPair(inputRef, cursorRef) {
  const input = inputRef.value;
  const cursor = cursorRef.value;
  if (!input || !cursor) return;

  const update = () => updateCursor(input, cursor);

  input.addEventListener('focus', () => {
    cursor.classList.add('visible');
    update();
  });

  input.addEventListener('blur', () => {
    cursor.classList.remove('visible');
  });

  input.addEventListener('input', update);
  input.addEventListener('click', update);
  input.addEventListener('keyup', update);
  input.addEventListener('select', update);
}

export function useCursor(pairs, when) {
  const setup = () => {
    nextTick(() => {
      pairs.forEach(([inputRef, cursorRef]) => {
        setupCursorPair(inputRef, cursorRef);
      });
    });
  };

  if (when) {
    watch(when, (val) => {
      if (val) setup();
    });
  } else {
    onMounted(setup);
  }
}
