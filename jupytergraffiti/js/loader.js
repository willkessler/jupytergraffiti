define([], () => {
  if (window.Graffiti !== undefined) { 
    console.log('Graffiti already instantiated, not reinitializing');
    return;
  }

  require([
    './graffiti.js', 
    './utils.js', 
    './storage.js', 
    './udacityUser.js'
    ], (Graffiti, utils, storage, udacityUser) => {
    console.log('Graffiti loaded:', Graffiti);
    window.Graffiti = Graffiti;
    udacityUser.setUser();
    Graffiti.init();

    Jupyter.notebook.events.on('kernel_reconnecting.Kernel', () => {
      console.log('kernel reconnecting');
    });

    Jupyter.notebook.events.on('kernel_ready.Kernel', () => {
      console.log('Graffiti: kernel ready, possible kernel restart.', e);
      if (!udacityUser.token) {
        udacityUser.setUser();
      } 
      require(['./loader.js']);
      utils.saveNotebook();
    });
  });
});
