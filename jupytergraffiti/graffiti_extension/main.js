// Mark Graffiti as about to load, because extension should always get precedence over python API library
// in case that is also going to be loaded by Jupyter.

window.Graffiti = null; 

define([
  'base/js/namespace',
  '/nbextensions/graffiti_extension/graffiti.js',
  '/nbextensions/graffiti_extension/utils.js',
  '/nbextensions/graffiti_extension/user.js'
], (Jupyter, Graffiti, utils, User) => {
  function load_ipython_extension() {
    console.log('Graffiti loaded:', Graffiti);
    window.Graffiti = Graffiti;
    Graffiti.init();
    utils.saveNotebook();

    Jupyter.notebook.events.on('kernel_restarting.Kernel', (e) => {
      console.log('Graffiti: kernel restarted, so rerunning require', e);
      require(['/nbextensions/graffiti_extension/loader.js']);
      utils.saveNotebook();
    });

    let importApiScript = '';
    // Create a symlink to get 'import jupytergraffiti' working
    importApiScript += '!ln -s /opt/jupytergraffiti jupytergraffiti\n';
    // Adding /opt/jupytergraffiti to system path allows us to import it as a python module
    importApiScript += 'import sys\n';
    importApiScript += 'api_path=\'/opt/jupytergraffiti\'\n';
    importApiScript += 'if api_path not in sys.path:\n';
    importApiScript += '  sys.path.insert(0,api_path)\n';

    const scriptOptions = {
      silent: false,
      store_history: false,
      stop_on_error : true
    }

    // TODO: Move to graffiti.js
    UdacityUser
      .getToken()
      .then(token => UdacityUser.getUdacityUser(token))
      .then(user => {
        user.coco && $('#graffiti-setup-button').css('display', 'inline-block');
        return Jupyter.notebook.kernel.execute(importApiScript, undefined, scriptOptions);
      })
      .catch(err => console.error(err));
  }
  
  return {
    load_ipython_extension: load_ipython_extension
  };
});
