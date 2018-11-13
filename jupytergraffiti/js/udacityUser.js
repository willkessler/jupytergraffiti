define([
  './utils.js'
], function(utils) {
        
  // Stub function, in Udacity usage we use a Udacity id instead.
  const udacityUser = {
    getUser: () => {
      return utils.generateUniqueId();
    }
  }

  return udacityUser;
});
