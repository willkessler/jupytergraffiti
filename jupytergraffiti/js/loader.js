if (window.Graffiti === undefined) {
  define([
    './graffiti.js',
    './utils.js',
    './udacityUser.js'
  ], (Graffiti,utils, udacityUser) => {
    console.log('Graffiti loaded:', Graffiti);
    window.Graffiti = Graffiti;
    udacityUser.setUser();
    Graffiti.init();
    utils.saveNotebook();

    Jupyter.notebook.events.on('kernel_ready.Kernel', (e) => { 
      console.log('Graffiti: kernel ready, possible kernel restart, so rerunning require', e); 
      require(['jupytergraffiti/js/loader.js']);
      utils.saveNotebook();
    });

  });
} else {
  console.log('Graffiti already instantiated, not reinitializing');
}


