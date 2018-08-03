define([
  'base/js/namespace',
  '/nbextensions/graffiti_extension/js/annotations.js',
  '/nbextensions/graffiti_extension/js/utils.js'
], (Jupyter, Annotations, utils) => {
  function load_ipython_extension() {
    console.log('Annotations loaded:', Annotations);
    window.Annotations = Annotations;
    Annotations.init();
    utils.saveNotebook();

    Jupyter.notebook.events.on('kernel_ready.Kernel', (e) => { 
      console.log('Annotations: kernel ready, possible kernel restart, so rerunning require', e); 
      require(['jupytergraffiti/js/loader.js']);
      utils.saveNotebook();
    });
  }

  return {
    load_ipython_extension: load_ipython_extension
  };
});
