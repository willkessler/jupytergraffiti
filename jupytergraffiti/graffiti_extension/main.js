// Mark Graffiti as about to load, because extension should always get precedence over python API library
// in case that is also going to be loaded by Jupyter.

window.Graffiti = null; 

define([
  'base/js/namespace',
  'js/graffiti.js',
  'js/utils.js',
  'js/storage.js',
  'js/udacityUser.js'
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
      require(['js/loader.js']);
      utils.saveNotebook();
    });
    
  }
  
  return {
    load_ipython_extension: load_ipython_extension
  };
});
