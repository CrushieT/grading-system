(() => {
  const invalidResources = new Set();

  function emit(eventName, detail = {}) {
    document.dispatchEvent(
      new CustomEvent(eventName, {
        detail: detail || {},
      })
    );
  }

  function on(eventName, handler) {
    document.addEventListener(eventName, handler);
  }

  function off(eventName, handler) {
    document.removeEventListener(eventName, handler);
  }

  function invalidate(resourceName) {
    if (!resourceName) return;
    invalidResources.add(String(resourceName));
  }

  function isInvalid(resourceName) {
    return invalidResources.has(String(resourceName));
  }

  function clearInvalid(resourceName) {
    invalidResources.delete(String(resourceName));
  }

  function debounce(fn, wait = 180) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    };
  }

  window.EduTrackEvents = {
    emit,
    on,
    off,
    invalidate,
    isInvalid,
    clearInvalid,
    debounce,
  };
})();
