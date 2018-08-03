define([
  './annotations.js',
  './utils.js'
], (Annotations,utils) => {
  console.log('Annotations loaded:', Annotations);
  window.Annotations = Annotations;
  Annotations.init();
  utils.saveNotebook();

  Jupyter.notebook.events.on('kernel_ready.Kernel', (e) => { 
    console.log('Annotations: kernel ready, possible kernel restart, so rerunning require', e); 
    require(['jupytergraffiti/js/loader.js']);
    utils.saveNotebook();
  });

});

