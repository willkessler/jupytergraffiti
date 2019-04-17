define([], function() {
  // From : http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection 
  const resizeListener = {

    attachEvent: document.attachEvent,
    isIE:  navigator.userAgent.match(/Trident/),

    requestFrame: () => {
      const raf = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame ||
                  function(fn){ return window.setTimeout(fn, 20); };
      return function(fn) { return raf(fn); };
    },
    
    cancelFrame: () => {
      const cancel = window.cancelAnimationFrame || window.mozCancelAnimationFrame || window.webkitCancelAnimationFrame ||
                     window.clearTimeout;
      return function(id) { return cancel(id); };
    },
    
    RAF: (e) => {
      var win = e.target || e.srcElement;
      if (win.__resizeRAF__) resizeListener.cancelFrame(win.__resizeRAF__);
      win.__resizeRAF__ = resizeListener.requestFrame(function(){
        var trigger = win.__resizeTrigger__;
        trigger.__resizeListeners__.forEach(function(fn){
          fn.call(trigger, e);
        });
      });
    },
    
    objectLoad: (e) => {
      const target = e.target;
      debugger;
      target.contentDocument.defaultView.__resizeTrigger__ = target.__resizeElement__;
      target.contentDocument.defaultView.addEventListener('resize', resizeListener.RAF);
    },
    
    addListener: (element, fn) => {
      if (!element.__resizeListeners__) {
        element.__resizeListeners__ = [];
        if (resizeListener.attachEvent) {
          element.__resizeTrigger__ = element;
          element.attachEvent('onresize', resizeListener.RAF);
        }
        else {
          if (getComputedStyle(element).position == 'static') element.style.position = 'relative';
          var obj = element.__resizeTrigger__ = document.createElement('object'); 
          obj.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; height: 100%; width: 100%; overflow: hidden; pointer-events: none; z-index: -1;');
          obj.__resizeElement__ = element;
          obj.onload = resizeListener.objectLoad;
          obj.type = 'text/html';
          if (resizeListener.isIE) element.appendChild(obj);
          obj.data = 'about:blank';
          if (!resizeListener.isIE) element.appendChild(obj);
        }
      }
      element.__resizeListeners__.push(fn);
    },
    
    removeListener: (element, fn) => {
      element.__resizeListeners__.splice(element.__resizeListeners__.indexOf(fn), 1);
      if (!element.__resizeListeners__.length) {
        if (resizeListener.attachEvent) element.detachEvent('onresize', resizeListener.RAF);
        else {
          element.__resizeTrigger__.contentDocument.defaultView.removeEventListener('resize', resizeListener.RAF);
          element.__resizeTrigger__ = !element.removeChild(element.__resizeTrigger__);
        }
      }
    }

  };

  return resizeListener;

});
