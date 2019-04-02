define([], () => {
  if (window.Graffiti !== undefined) { 
    console.log('Graffiti already instantiated, not reinitializing');
    return;
  }

  require([
    './graffiti.js',
    './utils.js',
    './state.js',
    './workspace.js'
    ], (Graffiti, utils, state, workspace) => {
    console.log('Graffiti loaded:', Graffiti);
    window.Graffiti = Graffiti;

    Jupyter.notebook.events.on('kernel_reconnecting.Kernel', (e) => { 
      console.log('Graffiti: kernel reconnecting');
    });

    const initExtension = () => { 
      state.init();
      workspace.setWorkspace()
      .then(() => Graffiti.init());
    }

    if (Jupyter.notebook.kernel) {
      initExtension();
    } else {
      Jupyter.notebook.events.on('kernel_ready.Kernel', (e) => {
        console.log('Graffiti: kernel ready, possible kernel restart.', e);
        initExtension();
        require(['./loader.js']);
        utils.saveNotebook();
      });
    }
  });
});
