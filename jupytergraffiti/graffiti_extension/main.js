define([
  'base/js/namespace',
  '/nbextensions/graffiti_extension/js/graffiti.js',
  '/nbextensions/graffiti_extension/js/utils.js'
], (Jupyter, Graffiti, utils) => {
  function load_ipython_extension() {
    console.log('Graffiti loaded:', Graffiti);
    window.Graffiti = Graffiti;
    Graffiti.init();
    utils.saveNotebook();

    Jupyter.notebook.events.on('kernel_restarting.Kernel', (e) => {
      console.log('Graffiti: kernel restarted, so rerunning require', e);
      require(['jupytergraffiti/js/loader.js']);
      utils.saveNotebook();
    });

    const action = {
      icon: 'fa-pencil', // a font-awesome class used on buttons, etc
      help    : 'Activate Graffiti',
      help_index : 'zz',
      handler : Graffiti.graffiti.firstTimeSetup
    };
    const prefix = 'activate_graffiti';
    const action_name = 'activate_graffiti';

    const full_action_name = Jupyter.actions.register(action, action_name, prefix);
    Jupyter.toolbar.add_buttons_group([full_action_name]);

  }

  return {
    load_ipython_extension: load_ipython_extension
  };
});
