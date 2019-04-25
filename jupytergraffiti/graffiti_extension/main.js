// Mark Graffiti as about to load, because extension should always get precedence over python API library
// in case that is also going to be loaded by Jupyter.

window.Graffiti = null; 

define([], () => {
  return {
    load_ipython_extension: () => {
      require(['jupytergraffiti/js/initExtension.js']);
    }
  };
});
