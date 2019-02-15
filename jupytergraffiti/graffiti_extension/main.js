// Mark Graffiti as about to load, because extension should always get precedence over python API library
// in case that is also going to be loaded by Jupyter.

window.Graffiti = null; 

define([
  'base/js/namespace',
  '/nbextensions/graffiti_extension/js/graffiti.js',
  '/nbextensions/graffiti_extension/js/utils.js',
  '/nbextensions/graffiti_extension/js/storage.js',
  '/nbextensions/graffiti_extension/js/udacityUser.js'
], (Jupyter, Graffiti, utils, storage, udacityUser) => {
  function load_ipython_extension() {
    console.log('Graffiti loaded:', Graffiti);
    window.Graffiti = Graffiti;
    udacityUser.setUser();
    Graffiti.init();

    Jupyter.notebook.events.on('kernel_ready.Kernel', (e) => { 
      console.log('Graffiti: kernel ready, possible kernel restart.', e);
      console.log('Reloading loader.js');
      require(['jupytergraffiti/graffiti_extension/main.js']);
      utils.saveNotebook();
    });
    
  }

  return {
    load_ipython_extension: load_ipython_extension
  };
});
