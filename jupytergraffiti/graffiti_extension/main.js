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

    const initExtension = () => {
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

    // the notebook may have fully loaded before the nbextension gets loaded
    // so the nbextension would miss the `notebook_loaded.Notebook` event
    if (Jupyter.notebook._fully_loaded) {
      console.log('Notebook is already fully loaded.');
      initExtension();
    } else {
      Jupyter.notebook.events.on('notebook_loaded.Notebook', function (e) {
        console.log('Notebook is loaded.');
        initExtension();
      })
    }    
  }
  
  return {
    load_ipython_extension: load_ipython_extension
  };
});
