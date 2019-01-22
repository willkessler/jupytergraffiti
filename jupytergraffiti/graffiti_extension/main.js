// Mark Graffiti as about to load, because extension should always get precedence over python API library
// in case that is also going to be loaded by Jupyter.

window.Graffiti = null; 

define([
  'base/js/namespace',
  '/nbextensions/graffiti_extension/graffiti.js',
  '/nbextensions/graffiti_extension/utils.js',
  '/nbextensions/graffiti_extension/storage.js',
  '/nbextensions/graffiti_extension/udacityUser.js'
], (Jupyter, Graffiti, utils, storage, udacityUser) => {
  function load_ipython_extension() {
    console.log('Graffiti loaded:', Graffiti);
    window.Graffiti = Graffiti;
    udacityUser.setUser();
    Graffiti.init();

    Jupyter.notebook.events.on('kernel_ready.Kernel', (e) => { 
      console.log('Graffiti: kernel ready, possible kernel restart.', e);
      console.log('Reloading loader.js');
      if (!udacityUser.token) {
        udacityUser.setUser();
      } 
      require(['/nbextensions/graffiti_extension/loader.js']);
      utils.saveNotebook();
    });
    
  }
  
  return {
    load_ipython_extension: load_ipython_extension
  };
});
