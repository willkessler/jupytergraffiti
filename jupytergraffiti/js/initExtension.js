/*
    Used by main.js and loader.js 
*/

define([
  'base/js/namespace',
  'js/graffiti.js',
  'js/utils.js',
  'js/state.js',
  'js/workspace.js'
], (Jupyter, Graffiti, utils, state, workspace) => {

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
        initGraffiti();
        require(['./loader.js']);
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
});
