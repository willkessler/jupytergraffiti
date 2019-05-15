/*
   Used by main.js and loader.js 
 */

define([
  'base/js/namespace',
  'jupytergraffiti/js/graffiti.js',
  'jupytergraffiti/js/utils.js',
  'jupytergraffiti/js/state.js',
  'jupytergraffiti/js/workspace.js'
], (Jupyter, Graffiti, utils, state, workspace) => {
  console.log('Graffiti loaded:', Graffiti);

  const initGraffiti = () => { 
    state.init();
    workspace.setWorkspace()
    .then(() => Graffiti.init());
  }

  // This ensures Jupyter.kernel.execute works
  const waitForKernelToBeReady = () => {
    window.Graffiti = Graffiti;
    
    if (Jupyter.notebook.kernel) {
      initGraffiti();
    } else {
      Jupyter.notebook.events.on('kernel_ready.Kernel', (e) => {
        console.log('Graffiti: kernel ready, possible kernel restart.', e);
        console.log('Graffiti: Reloading loader.js');
        // Prevent double initialization
        if (!state.getActivity()) {
          initGraffiti();
        }
        require(['js/loader.js']);
        utils.saveNotebookDebounced();
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
});
