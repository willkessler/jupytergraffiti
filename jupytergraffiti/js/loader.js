define([
  './graffiti.js',
  './utils.js'
], (Graffiti,utils) => {
  console.log('Graffiti loaded:', Graffiti);
  window.Graffiti = Graffiti;
  Graffiti.init();
  utils.saveNotebook();

  Jupyter.notebook.events.on('kernel_ready.Kernel', (e) => { 
    console.log('Graffiti: kernel ready, possible kernel restart, so rerunning require', e); 
    require(['jupytergraffiti/js/loader.js']);
    utils.saveNotebook();
  });

});

