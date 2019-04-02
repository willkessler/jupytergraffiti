// Mark Graffiti as about to load, because extension should always get precedence over python API library
// in case that is also going to be loaded by Jupyter.

window.Graffiti = null; 

define([
  'base/js/namespace',
  'js/graffiti.js',
  'js/utils.js',
  'js/state.js',
  'js/workspace.js'
], (Jupyter, Graffiti, utils, state, workspace) => {
  console.log('Graffiti loaded:', Graffiti);
  function load_ipython_extension() {

    const initExtension = () => { 
      state.init();
      workspace.setWorkspace()
      .then(() => Graffiti.init());
    }

    // This ensures Jupyter.kernel.execute works
    const waitForKernelToBeReady = () => {
      window.Graffiti = Graffiti;
      
      if (Jupyter.notebook.kernel) {
        initExtension();
      } else {
        Jupyter.notebook.events.on('kernel_ready.Kernel', (e) => {
          console.log('Graffiti: kernel ready, possible kernel restart.', e);
          console.log('Graffiti: Reloading loader.js');
          initExtension();
          require(['js/loader.js']);
          utils.saveNotebook();
        });
      }
    }

    // the notebook may have fully loaded before the nbextension gets loaded
    // so the nbextension would miss the `notebook_loaded.Notebook` event
    if (Jupyter.notebook._fully_loaded) {
      console.log('Graffiti: Notebook is already fully loaded.');
      waitForKernelToBeReady();
    } else {
      Jupyter.notebook.events.on('notebook_loaded.Notebook', (e) => {
        console.log('Graffiti: Notebook is loaded.');
        waitForKernelToBeReady();
      })
    }   
  }
  
  return {
    load_ipython_extension: load_ipython_extension
  };

});
